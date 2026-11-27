import { pool } from '../pool.js'
import { requireShopId } from './guard.js'

/** Public shop settings (never exposes the Page token). */
export async function findById(shopId, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(
    `SELECT id, name, fb_page_id, bank_code, bank_account_number, bank_account_name,
            is_demo, demo_expires_at, created_at
       FROM shops WHERE id = $1`,
    [shopId],
  )
  return rows[0] ?? null
}

/** Raw row including fb_page_token; only for services that need to call the Send API. */
export async function findByIdWithToken(shopId, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query('SELECT * FROM shops WHERE id = $1', [shopId])
  return rows[0] ?? null
}

export async function updateSettings(shopId, patch, db = pool) {
  requireShopId(shopId)
  const allowed = ['name', 'fb_page_id', 'fb_page_token', 'bank_code', 'bank_account_number', 'bank_account_name']
  const entries = Object.entries(patch).filter(([key, value]) => allowed.includes(key) && value !== undefined)
  if (!entries.length) return findById(shopId, db)
  const sets = entries.map(([key], i) => `${key} = $${i + 2}`)
  const { rows } = await db.query(
    `UPDATE shops SET ${sets.join(', ')} WHERE id = $1
     RETURNING id, name, fb_page_id, bank_code, bank_account_number, bank_account_name, is_demo, demo_expires_at`,
    [shopId, ...entries.map(([, value]) => value)],
  )
  return rows[0] ?? null
}

/** Cross-shop maintenance query for the demo cleanup job (the only repo function without a shop id). */
export async function findExpiredDemoShops(now = new Date(), db = pool) {
  const { rows } = await db.query(
    'SELECT id, name, demo_expires_at FROM shops WHERE is_demo AND demo_expires_at IS NOT NULL AND demo_expires_at < $1',
    [now],
  )
  return rows
}

export async function deleteById(shopId, db = pool) {
  requireShopId(shopId)
  await db.query('DELETE FROM shops WHERE id = $1', [shopId])
}
