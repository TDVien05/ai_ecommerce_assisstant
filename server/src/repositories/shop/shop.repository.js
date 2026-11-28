// All queries for the `shops` table. See docs/ARCHITECTURE.md, section "Repositories".
import { query } from '../../config/database.js'
import { requireShopId } from '../guard.js'

/** Public shop settings (never exposes the Page token). */
export async function findById(shopId, db) {
  requireShopId(shopId)
  const { rows } = await query(
    `SELECT id, name, fb_page_id, bank_code, bank_account_number, bank_account_name,
            is_demo, demo_expires_at, created_at
       FROM shops WHERE id = $1`,
    [shopId], db,
  )
  return rows[0] ?? null
}

/** Raw row including fb_page_token; only for services that need to call the Send API. */
export async function findByIdWithToken(shopId, db) {
  requireShopId(shopId)
  const { rows } = await query('SELECT * FROM shops WHERE id = $1', [shopId], db)
  return rows[0] ?? null
}

/** Messenger webhooks only carry the Page id; demo shops share the template's Page id. */
export async function findByPageId(fbPageId, db) {
  const { rows } = await query(
    `SELECT id, name, fb_page_id, bank_code, bank_account_number, bank_account_name,
            is_demo, demo_expires_at
       FROM shops WHERE fb_page_id = $1 AND NOT is_demo
      ORDER BY created_at LIMIT 1`,
    [fbPageId], db,
  )
  return rows[0] ?? null
}

/** SePay webhooks only carry the receiving account number. */
export async function findByBankAccount(accountNumber, db) {
  if (!accountNumber) return null
  const { rows } = await query(
    `SELECT id, name, bank_code, bank_account_number, is_demo
       FROM shops WHERE bank_account_number = $1 AND NOT is_demo
      ORDER BY created_at LIMIT 1`,
    [accountNumber], db,
  )
  return rows[0] ?? null
}

export async function updateSettings(shopId, patch, db) {
  requireShopId(shopId)
  const allowed = ['name', 'fb_page_id', 'fb_page_token', 'bank_code', 'bank_account_number', 'bank_account_name']
  const entries = Object.entries(patch).filter(([key, value]) => allowed.includes(key) && value !== undefined)
  if (!entries.length) return findById(shopId, db)
  const sets = entries.map(([key], i) => `${key} = $${i + 2}`)
  const { rows } = await query(
    `UPDATE shops SET ${sets.join(', ')} WHERE id = $1
     RETURNING id, name, fb_page_id, bank_code, bank_account_number, bank_account_name, is_demo, demo_expires_at`,
    [shopId, ...entries.map(([, value]) => value)], db,
  )
  return rows[0] ?? null
}

/** Cross-shop maintenance query for the demo cleanup job (the only repo function without a shop id). */
export async function findExpiredDemoShops(now = new Date(), db) {
  const { rows } = await query(
    'SELECT id, name, demo_expires_at FROM shops WHERE is_demo AND demo_expires_at IS NOT NULL AND demo_expires_at < $1',
    [now], db,
  )
  return rows
}

export async function deleteById(shopId, db) {
  requireShopId(shopId)
  await query('DELETE FROM shops WHERE id = $1', [shopId], db)
}

const settingsColumns = 'id, name, bank_code, bank_account_number, bank_account_name'

export async function findShop(id, { client, lock = false } = {}) {
  const { rows } = await query(`SELECT ${settingsColumns} FROM shops WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id], client)
  return rows[0] ?? null
}

export async function saveShop(id, settings, client) {
  const { rows } = await query(
    `UPDATE shops SET name = $2, bank_code = $3, bank_account_number = $4, bank_account_name = $5 WHERE id = $1 RETURNING ${settingsColumns}`,
    [id, settings.name, settings.bankCode, settings.bankAccountNumber, settings.bankAccountName], client,
  )
  return rows[0] ?? null
}

/** fb_page_id of the seeded template shop that every demo shop copies. */
export const TEMPLATE_PAGE_ID = 'TEMPLATE_LAN_CLOSET'

export async function findTemplate(db) {
  const { rows } = await query(
    'SELECT id, name, bank_code, bank_account_number, bank_account_name FROM shops WHERE fb_page_id = $1',
    [TEMPLATE_PAGE_ID], db,
  )
  return rows[0] ?? null
}

/** New demo shop that expires after ttlHours. */
export async function createDemo({ name, bankCode, bankAccountNumber, bankAccountName, ttlHours }, db) {
  const { rows } = await query(
    `INSERT INTO shops (name, bank_code, bank_account_number, bank_account_name, is_demo, demo_expires_at)
     VALUES ($1, $2, $3, $4, true, now() + make_interval(hours => $5))
     RETURNING id, name, demo_expires_at`,
    [name, bankCode, bankAccountNumber, bankAccountName, ttlHours], db,
  )
  return rows[0]
}

export async function findDemoFlag(shopId, db) {
  const { rows } = await query('SELECT id, is_demo FROM shops WHERE id = $1', [shopId], db)
  return rows[0] ?? null
}

export async function extendDemo(shopId, ttlHours, db) {
  await query(
    'UPDATE shops SET demo_expires_at = now() + make_interval(hours => $2) WHERE id = $1',
    [shopId, ttlHours], db,
  )
}
