import { pool } from '../pool.js'

const columns = 'id, name, bank_code, bank_account_number, bank_account_name'

export async function findShop(id, { client = pool, lock = false } = {}) {
  const { rows } = await client.query(`SELECT ${columns} FROM shops WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id])
  return rows[0] ?? null
}

export async function saveShop(id, settings, client) {
  const { rows } = await client.query(
    `UPDATE shops SET name = $2, bank_code = $3, bank_account_number = $4, bank_account_name = $5 WHERE id = $1 RETURNING ${columns}`,
    [id, settings.name, settings.bankCode, settings.bankAccountNumber, settings.bankAccountName],
  )
  return rows[0] ?? null
}
