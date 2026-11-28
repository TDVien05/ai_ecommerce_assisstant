import { pool } from './pool.js'

export async function loadSnapshot(shopId) {
  const shop = await pool.query('SELECT name FROM shops WHERE id = $1', [shopId])
  if (!shop.rowCount) return null
  const threads = await pool.query('SELECT id, title, status, scope, updated_at FROM assistant_threads WHERE shop_id = $1 ORDER BY updated_at, id', [shopId])
  const messages = await pool.query('SELECT conversation_id, body FROM assistant_messages WHERE shop_id = $1 ORDER BY seq', [shopId])
  return { shopName: shop.rows[0].name, threads: threads.rows, messages: messages.rows }
}

export async function conversationExists(shopId, conversationId) {
  if (conversationId === 'hub') return (await pool.query('SELECT 1 FROM shops WHERE id = $1', [shopId])).rowCount > 0
  return (await pool.query('SELECT 1 FROM assistant_threads WHERE shop_id = $1 AND id = $2', [shopId, conversationId])).rowCount > 0
}

export async function attachmentsExist(shopId, attachments) {
  if (!attachments.length) return true
  const ids = [...new Set(attachments.map((file) => file.fileId))]
  const result = await pool.query('SELECT id, name FROM assistant_files WHERE shop_id = $1 AND id = ANY($2::uuid[])', [shopId, ids])
  const found = new Map(result.rows.map((row) => [row.id, row.name]))
  return attachments.every((file) => found.get(file.fileId) === file.name)
}

export async function insertMessage(shopId, conversationId, message, client = pool) {
  await client.query('INSERT INTO assistant_messages (shop_id, id, conversation_id, role, body) VALUES ($1, $2, $3, $4, $5)', [shopId, message.id, conversationId, message.role, message])
}

export async function recentMessages(shopId, conversationId) {
  const { rows } = await pool.query('SELECT body FROM (SELECT seq, body FROM assistant_messages WHERE shop_id = $1 AND conversation_id = $2 ORDER BY seq DESC LIMIT 20) recent ORDER BY seq', [shopId, conversationId])
  return rows.map((row) => row.body)
}

export async function recoverInterrupted(client) {
  const steps = await client.query("UPDATE assistant_steps SET state = 'failed', decided_at = now(), view = jsonb_set(view, '{state}', '\"failed\"') WHERE state = 'working' RETURNING shop_id, id, message_id")
  for (const step of steps.rows) {
    const found = await client.query('SELECT body FROM assistant_messages WHERE shop_id = $1 AND id = $2 FOR UPDATE', [step.shop_id, step.message_id])
    const message = found.rows[0]?.body
    if (Array.isArray(message?.blocks)) {
      message.blocks = message.blocks.map((block) => block.type === 'agentStep' && block.stepId === step.id ? { ...block, state: 'failed', doneText: 'Tác vụ bị gián đoạn khi máy chủ khởi động lại.' } : block)
      await client.query('UPDATE assistant_messages SET body = $3, updated_at = now() WHERE shop_id = $1 AND id = $2', [step.shop_id, step.message_id, message])
    }
  }
  return client.query("UPDATE assistant_threads SET status = 'done', updated_at = now() WHERE status = 'running' RETURNING shop_id, id")
}
