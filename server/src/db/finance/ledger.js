import { pool } from '../pool.js'

export async function summary(shopId, from, to) {
  const { rows } = await pool.query(`SELECT
    count(*)::int AS total_count,
    count(*) FILTER (WHERE kind IS NULL)::int AS unknown_count,
    count(*) FILTER (WHERE (kind = 'BUSINESS_REVENUE' AND type = 'INCOME') OR (kind = 'EXPENSE' AND type = 'EXPENSE'))::int AS classified_count,
    COALESCE(sum(amount) FILTER (WHERE kind = 'BUSINESS_REVENUE' AND type = 'INCOME'), 0)::text AS revenue,
    COALESCE(sum(amount) FILTER (WHERE kind = 'EXPENSE' AND type = 'EXPENSE'), 0)::text AS expenses
    FROM ledger_entries WHERE shop_id = $1 AND occurred_at >= $2 AND occurred_at < $3`, [shopId, from, to])
  return rows[0]
}

export async function list(shopId, from, to, type) {
  const { rows } = await pool.query(`SELECT id, type, kind, category, amount, note, occurred_at
    FROM ledger_entries WHERE shop_id = $1 AND occurred_at >= $2 AND occurred_at < $3
    AND ($4::text IS NULL OR type = $4) ORDER BY occurred_at DESC, id LIMIT 101`, [shopId, from, to, type ?? null])
  return rows
}
