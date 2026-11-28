export async function createStep(shopId, conversationId, messageId, pending, client) {
  await client.query('INSERT INTO assistant_steps (id, shop_id, conversation_id, message_id, state, view, actions) VALUES ($1,$2,$3,$4,$5,$6,$7)', [pending.view.stepId, shopId, conversationId, messageId, pending.view.state, pending.view, JSON.stringify(pending.actions)])
}

export async function lockStep(shopId, id, client) {
  const { rows } = await client.query('SELECT * FROM assistant_steps WHERE shop_id = $1 AND id = $2 FOR UPDATE', [shopId, id])
  return rows[0] ?? null
}

export async function saveStepAndMessage(step, view, client) {
  const found = await client.query('SELECT body FROM assistant_messages WHERE shop_id = $1 AND id = $2 FOR UPDATE', [step.shop_id, step.message_id])
  if (!found.rowCount) throw new Error('Assistant step message missing')
  const message = found.rows[0].body
  const index = message.blocks.findIndex((block) => block.type === 'agentStep' && block.stepId === step.id)
  if (index < 0) throw new Error('Assistant step block missing')
  message.blocks[index] = view
  await client.query('UPDATE assistant_steps SET state = $3, view = $4, decided_at = CASE WHEN $3 IN (\'done\',\'undone\') THEN now() ELSE decided_at END WHERE shop_id = $1 AND id = $2', [step.shop_id, step.id, view.state, view])
  await client.query('UPDATE assistant_messages SET body = $3, updated_at = now() WHERE shop_id = $1 AND id = $2', [step.shop_id, step.message_id, message])
  return message
}

export async function addLog(shopId, stepId, userId, tool, before, after, client) {
  await client.query('INSERT INTO assistant_action_log (shop_id, step_id, user_id, tool, before, after) VALUES ($1,$2,$3,$4,$5,$6)', [shopId, stepId, userId, tool, before, after])
}

export async function getLogs(shopId, stepId, client) {
  const { rows } = await client.query('SELECT id, tool, before, after FROM assistant_action_log WHERE shop_id = $1 AND step_id = $2 AND undone_at IS NULL', [shopId, stepId])
  return rows
}

export async function markUndone(shopId, stepId, client) {
  await client.query('UPDATE assistant_action_log SET undone_at = now() WHERE shop_id = $1 AND step_id = $2 AND undone_at IS NULL', [shopId, stepId])
}
