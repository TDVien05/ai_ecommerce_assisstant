// All queries for the `assistant_action_log` table. See docs/ARCHITECTURE.md, section "Repositories".
import { query } from '../../config/database.js'

export async function addLog(shopId, stepId, userId, tool, before, after, client) {
  await query('INSERT INTO assistant_action_log (shop_id, step_id, user_id, tool, before, after) VALUES ($1,$2,$3,$4,$5,$6)', [shopId, stepId, userId, tool, before, after], client)
}

export async function getLogs(shopId, stepId, client) {
  const { rows } = await query('SELECT id, tool, before, after FROM assistant_action_log WHERE shop_id = $1 AND step_id = $2 AND undone_at IS NULL', [shopId, stepId], client)
  return rows
}

export async function markUndone(shopId, stepId, client) {
  await query('UPDATE assistant_action_log SET undone_at = now() WHERE shop_id = $1 AND step_id = $2 AND undone_at IS NULL', [shopId, stepId], client)
}
