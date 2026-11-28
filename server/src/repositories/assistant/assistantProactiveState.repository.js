import { query } from '../../config/database.js'
import { requireShopId } from '../guard.js'

export async function lockScanState(shopId, opened, now, client) {
  requireShopId(shopId)
  if (opened) {
    await query(`INSERT INTO assistant_proactive_state (shop_id, last_opened_at) VALUES ($1, $2)
      ON CONFLICT (shop_id) DO UPDATE SET last_opened_at = GREATEST(assistant_proactive_state.last_opened_at, excluded.last_opened_at)`, [shopId, now], client)
  }
  const { rows } = await query('SELECT * FROM assistant_proactive_state WHERE shop_id = $1 FOR UPDATE', [shopId], client)
  return rows[0] ?? null
}

export async function recordScan(shopId, now, client) {
  await query('UPDATE assistant_proactive_state SET last_scanned_at = GREATEST(last_scanned_at, $2) WHERE shop_id = $1', [shopId, now], client)
}

export async function reserveWording(shopId, day, limit, client) {
  const { rowCount } = await query(`UPDATE assistant_proactive_state
    SET ai_calls = CASE WHEN ai_day = $2 THEN ai_calls + 1 ELSE 1 END, ai_day = $2
    WHERE shop_id = $1 AND ($3::int > 0 AND (ai_day IS NULL OR ai_day < $2 OR (ai_day = $2 AND ai_calls < $3)))`,
  [shopId, day, limit], client)
  return rowCount > 0
}

export async function advanceRevision(shopId, client) {
  await query('UPDATE assistant_proactive_state SET revision = revision + 1 WHERE shop_id = $1', [shopId], client)
}

export async function recentlyOpenedShops(activeSince, dueBefore, limit) {
  const { rows } = await query(`SELECT shop_id FROM assistant_proactive_state
    WHERE last_opened_at >= $1 AND (last_scanned_at IS NULL OR last_scanned_at < $2)
    ORDER BY last_scanned_at NULLS FIRST, shop_id LIMIT $3`, [activeSince, dueBefore, limit])
  return rows.map((row) => row.shop_id)
}
