// All queries for the `assistant_steps` table. See docs/ARCHITECTURE.md, section "Repositories".
import { query } from '../../config/database.js'

export async function createStep(shopId, conversationId, messageId, pending, client) {
  await query('INSERT INTO assistant_steps (id, shop_id, conversation_id, message_id, state, view, actions) VALUES ($1,$2,$3,$4,$5,$6,$7)', [pending.view.stepId, shopId, conversationId, messageId, pending.view.state, pending.view, JSON.stringify(pending.actions)], client)
}

export async function lockStep(shopId, id, client) {
  const { rows } = await query('SELECT * FROM assistant_steps WHERE shop_id = $1 AND id = $2 FOR UPDATE', [shopId, id], client)
  return rows[0] ?? null
}

export async function saveActions(shopId,id,actions,client) {
  await query('UPDATE assistant_steps SET actions=$3 WHERE shop_id=$1 AND id=$2',[shopId,id,JSON.stringify(actions)],client)
}

export async function saveStepAndMessage(step, view, client) {
  const found = await query('SELECT body FROM assistant_messages WHERE shop_id = $1 AND id = $2 FOR UPDATE', [step.shop_id, step.message_id], client)
  if (!found.rowCount) throw new Error('Assistant step message missing')
  const message = found.rows[0].body
  const index = message.blocks.findIndex((block) => block.type === 'agentStep' && block.stepId === step.id)
  if (index < 0) throw new Error('Assistant step block missing')
  message.blocks[index] = view
  await query('UPDATE assistant_steps SET state = $3, view = $4, decided_at = CASE WHEN $3 IN (\'done\',\'undone\') THEN now() ELSE decided_at END WHERE shop_id = $1 AND id = $2', [step.shop_id, step.id, view.state, view], client)
  await query('UPDATE assistant_messages SET body = $3, updated_at = now() WHERE shop_id = $1 AND id = $2', [step.shop_id, step.message_id, message], client)
  return message
}

export async function recoverInterrupted(client) {
  const steps = await query("UPDATE assistant_steps SET state = 'failed', decided_at = now(), view = jsonb_set(view, '{state}', '\"failed\"') WHERE state = 'working' RETURNING shop_id, id, message_id", undefined, client)
  for (const step of steps.rows) {
    const found = await query('SELECT body FROM assistant_messages WHERE shop_id = $1 AND id = $2 FOR UPDATE', [step.shop_id, step.message_id], client)
    const message = found.rows[0]?.body
    if (Array.isArray(message?.blocks)) {
      message.blocks = message.blocks.map((block) => block.type === 'agentStep' && block.stepId === step.id ? { ...block, state: 'failed', doneText: 'Tác vụ bị gián đoạn khi máy chủ khởi động lại.' } : block)
      await query('UPDATE assistant_messages SET body = $3, updated_at = now() WHERE shop_id = $1 AND id = $2', [step.shop_id, step.message_id, message], client)
    }
  }
  return query("UPDATE assistant_threads SET status = 'done', updated_at = now() WHERE status = 'running' RETURNING shop_id, id", undefined, client)
}
