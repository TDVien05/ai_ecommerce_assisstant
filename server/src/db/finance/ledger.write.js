import { pool } from '../pool.js'

const columns = 'id, shop_id, type, kind, channel, category, amount, order_id, note, occurred_at, created_at, document_ref, document_date, industry, manual'

export async function findEntry(shopId, id, client = pool, lock = false) {
  const { rows } = await client.query(`SELECT ${columns} FROM ledger_entries WHERE shop_id = $1 AND id = $2${lock ? ' FOR UPDATE' : ''}`, [shopId, id])
  return rows[0] ?? null
}

export async function createEntry(shopId, input, client = pool) {
  const { rows } = await client.query(`INSERT INTO ledger_entries (shop_id, type, kind, channel, category, amount, note, occurred_at, document_ref, document_date, industry, manual)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true) RETURNING ${columns}`,
  [shopId, input.type, input.kind, input.channel, input.category, input.amount, input.note ?? null, input.occurredAt, input.documentRef ?? null, input.documentDate ?? null, input.industry ?? null])
  return rows[0]
}

export async function removeEntry(shopId, id, client = pool) {
  const result = await client.query('DELETE FROM ledger_entries WHERE shop_id = $1 AND id = $2 AND manual = true', [shopId, id])
  return result.rowCount > 0
}

export async function restoreEntry(row, client) {
  await client.query(`INSERT INTO ledger_entries (${columns}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [row.id, row.shop_id, row.type, row.kind, row.channel, row.category, row.amount, row.order_id, row.note, row.occurred_at, row.created_at, row.document_ref, row.document_date, row.industry, row.manual])
}
