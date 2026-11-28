// All queries for the `ledger_entries` table. See docs/ARCHITECTURE.md, section "Repositories".
import { query } from '../../config/database.js'
import { requireShopId } from '../guard.js'

const columns = `id, shop_id, type, category, amount, order_id, note, occurred_at, created_at,
  source, label_id, counterparty, raw_description, dedupe_key, run_id`

export async function list(shopId, { from, to, type, labelId, limit = 100, offset = 0 } = {}, db) {
  requireShopId(shopId)
  const params = [shopId]
  let where = 'shop_id = $1'
  for (const [column, value] of [['occurred_at >=', from], ['occurred_at <', to], ['type =', type], ['label_id =', labelId]]) {
    if (value === undefined || value === null) continue
    params.push(value)
    where += ` AND ${column} $${params.length}`
  }
  params.push(limit, offset)
  const { rows } = await query(
    `SELECT ${columns} FROM ledger_entries WHERE ${where}
      ORDER BY occurred_at DESC, created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params, db,
  )
  return rows
}

export async function findById(shopId, id, db) {
  requireShopId(shopId)
  const { rows } = await query(`SELECT ${columns} FROM ledger_entries WHERE shop_id = $1 AND id = $2`, [shopId, id], db)
  return rows[0] ?? null
}

export async function create(shopId, entry, db) {
  requireShopId(shopId)
  const {
    type, category, amount, orderId = null, note = null, occurredAt = new Date(),
    source = 'manual', labelId = null, counterparty = null, rawDescription = null,
    dedupeKey = null, runId = null,
  } = entry
  const { rows } = await query(
    `INSERT INTO ledger_entries (shop_id, type, category, amount, order_id, note, occurred_at,
                                 source, label_id, counterparty, raw_description, dedupe_key, run_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING ${columns}`,
    [shopId, type, category, amount, orderId, note, occurredAt, source, labelId, counterparty, rawDescription, dedupeKey, runId], db,
  )
  return rows[0]
}

/** Bank/webhook imports: the same dedupe_key never creates a second row. */
export async function createOnce(shopId, entry, db) {
  requireShopId(shopId)
  const {
    type, kind = null, channel = null, category, amount, orderId = null, note = null, occurredAt = new Date(),
    source = 'manual', labelId = null, counterparty = null, rawDescription = null,
    dedupeKey, runId = null,
  } = entry
  if (!dedupeKey) throw new Error('dedupeKey is required by createOnce')
  const { rows } = await query(
    `INSERT INTO ledger_entries (shop_id, type, kind, channel, category, amount, order_id, note, occurred_at,
                                 source, label_id, counterparty, raw_description, dedupe_key, run_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     ON CONFLICT (shop_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
     RETURNING ${columns}`,
    [shopId, type, kind, channel, category, amount, orderId, note, occurredAt, source, labelId, counterparty, rawDescription, dedupeKey, runId], db,
  )
  if (rows[0]) return { entry: rows[0], inserted: true }
  const existing = await query(
    `SELECT ${columns} FROM ledger_entries WHERE shop_id = $1 AND dedupe_key = $2`,
    [shopId, dedupeKey], db,
  )
  return { entry: existing.rows[0] ?? null, inserted: false }
}

export async function remove(shopId, id, db) {
  requireShopId(shopId)
  const result = await query('DELETE FROM ledger_entries WHERE shop_id = $1 AND id = $2', [shopId, id], db)
  return result.rowCount > 0
}

const filter = "l.shop_id = $1 AND ($2::timestamptz IS NULL OR l.occurred_at >= $2) AND ($3::timestamptz IS NULL OR l.occurred_at < $3)"

export async function ledger(shopId, { from = null, to = null, type = null }) {
  const { rows } = await query(`SELECT l.id,l.type,l.kind,l.channel,l.category,l.document_ref,l.document_date,l.industry,l.amount,l.order_id,o.payment_code AS order_code,l.note,l.occurred_at,l.manual
    FROM ledger_entries l LEFT JOIN orders o ON o.id = l.order_id AND o.shop_id = l.shop_id
    WHERE ${filter} AND ($4::text IS NULL OR l.type = $4) ORDER BY l.occurred_at DESC,l.id`, [shopId, from, to, type])
  return rows
}

export async function counts(shopId, { from = null, to = null }) {
  const { rows } = await query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE l.kind IS NULL)::int AS unknown,
    count(*) FILTER (WHERE l.kind = 'BUSINESS_REVENUE' AND l.type = 'INCOME' AND (l.order_id IS NULL OR NOT EXISTS (SELECT 1 FROM orders o WHERE o.id=l.order_id AND o.shop_id=l.shop_id)))::int AS missing_cost
    FROM ledger_entries l WHERE ${filter}`, [shopId, from, to])
  return rows[0]
}

export async function summary(shopId, { from = null, to = null }) {
  const { rows } = await query(`WITH entries AS (SELECT l.* FROM ledger_entries l WHERE ${filter}),
    revenue AS (SELECT COALESCE(sum(amount) FILTER (WHERE kind='BUSINESS_REVENUE' AND type='INCOME'),0)::numeric AS amount,
      COALESCE(sum(amount) FILTER (WHERE kind='EXPENSE' AND type='EXPENSE'),0)::numeric AS expense FROM entries),
    order_revenue AS (SELECT order_id, sum(amount)::numeric AS amount FROM entries WHERE kind='BUSINESS_REVENUE' AND type='INCOME' AND order_id IS NOT NULL GROUP BY order_id),
    item_cost AS (SELECT oi.order_id,sum(oi.unit_cost::numeric * oi.quantity)::numeric AS amount FROM order_items oi JOIN order_revenue r ON r.order_id=oi.order_id JOIN orders o ON o.id=oi.order_id AND o.shop_id=$1 GROUP BY oi.order_id),
    orders AS (SELECT count(*)::int AS count, COALESCE(sum(r.amount),0)::numeric AS revenue, COALESCE(sum(c.amount),0)::numeric AS cost, count(*) FILTER (WHERE c.order_id IS NULL)::int AS missing_items FROM order_revenue r LEFT JOIN item_cost c ON c.order_id=r.order_id)
    SELECT revenue.amount::text AS revenue,revenue.expense::text AS expenses,orders.cost::text AS cost,orders.revenue::text AS order_revenue,orders.count AS order_count,orders.missing_items FROM revenue CROSS JOIN orders`, [shopId, from, to])
  return rows[0]
}

export async function timeseries(shopId, { from = null, to = null, interval = 'day' }) {
  const { rows } = await query(`SELECT date_trunc($4, l.occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS date, sum(l.amount)::text AS revenue
    FROM ledger_entries l WHERE ${filter} AND l.kind='BUSINESS_REVENUE' AND l.type='INCOME' GROUP BY 1 ORDER BY 1`, [shopId, from, to, interval])
  return rows
}

export async function topProducts(shopId, { from = null, to = null, limit = 5 }) {
  const { rows } = await query(`WITH matched AS (SELECT DISTINCT l.order_id FROM ledger_entries l WHERE ${filter} AND l.kind='BUSINESS_REVENUE' AND l.type='INCOME' AND l.order_id IS NOT NULL)
    SELECT COALESCE(oi.product_id::text,oi.name_snapshot) AS product_id, oi.name_snapshot AS name, sum(oi.quantity)::text AS quantity, sum(oi.unit_price::numeric*oi.quantity)::text AS revenue
    FROM order_items oi JOIN matched m ON m.order_id=oi.order_id JOIN orders o ON o.id=oi.order_id AND o.shop_id=$1
    GROUP BY 1,2 ORDER BY sum(oi.unit_price::numeric*oi.quantity) DESC,1 LIMIT $4`, [shopId, from, to, limit])
  return rows
}

export async function periodSummary(shopId, from, to) {
  const { rows } = await query(`SELECT
    count(*)::int AS total_count,
    count(*) FILTER (WHERE kind IS NULL)::int AS unknown_count,
    count(*) FILTER (WHERE (kind = 'BUSINESS_REVENUE' AND type = 'INCOME') OR (kind = 'EXPENSE' AND type = 'EXPENSE'))::int AS classified_count,
    COALESCE(sum(amount) FILTER (WHERE kind = 'BUSINESS_REVENUE' AND type = 'INCOME'), 0)::text AS revenue,
    COALESCE(sum(amount) FILTER (WHERE kind = 'EXPENSE' AND type = 'EXPENSE'), 0)::text AS expenses
    FROM ledger_entries WHERE shop_id = $1 AND occurred_at >= $2 AND occurred_at < $3`, [shopId, from, to])
  return rows[0]
}

export async function listPeriod(shopId, from, to, type) {
  const { rows } = await query(`SELECT id, type, kind, category, amount, note, occurred_at
    FROM ledger_entries WHERE shop_id = $1 AND occurred_at >= $2 AND occurred_at < $3
    AND ($4::text IS NULL OR type = $4) ORDER BY occurred_at DESC, id LIMIT 101`, [shopId, from, to, type ?? null])
  return rows
}

const entryColumns = 'id, shop_id, type, kind, channel, category, amount, order_id, note, occurred_at, created_at, document_ref, document_date, industry, manual'

export async function findEntry(shopId, id, client, lock = false) {
  const { rows } = await query(`SELECT ${entryColumns} FROM ledger_entries WHERE shop_id = $1 AND id = $2${lock ? ' FOR UPDATE' : ''}`, [shopId, id], client)
  return rows[0] ?? null
}

export async function createEntry(shopId, input, client) {
  const { rows } = await query(`INSERT INTO ledger_entries (shop_id, type, kind, channel, category, amount, note, occurred_at, document_ref, document_date, industry, manual)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true) RETURNING ${entryColumns}`,
  [shopId, input.type, input.kind, input.channel, input.category, input.amount, input.note ?? null, input.occurredAt, input.documentRef ?? null, input.documentDate ?? null, input.industry ?? null], client)
  return rows[0]
}

export async function removeEntry(shopId, id, client) {
  const result = await query('DELETE FROM ledger_entries WHERE shop_id = $1 AND id = $2 AND manual = true', [shopId, id], client)
  return result.rowCount > 0
}

export async function restoreEntry(row, client) {
  await query(`INSERT INTO ledger_entries (${entryColumns}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [row.id, row.shop_id, row.type, row.kind, row.channel, row.category, row.amount, row.order_id, row.note, row.occurred_at, row.created_at, row.document_ref, row.document_date, row.industry, row.manual], client)
}

/** Demo copy: ledger entries, shifted by `interval`, linked to the copied orders (demo_order_map). */
export async function copyFromShop(shopId, templateId, interval, keySuffix, db) {
  await query(
    `INSERT INTO ledger_entries (shop_id, type, category, amount, order_id, note, occurred_at, source,
                                 counterparty, raw_description, dedupe_key)
     SELECT $1, l.type, l.category, l.amount, m.new_id, l.note, l.occurred_at + $3::interval, l.source,
            l.counterparty, l.raw_description,
            l.dedupe_key || ':' || $4
       FROM ledger_entries l
       LEFT JOIN demo_order_map m ON m.old_id = l.order_id
      WHERE l.shop_id = $2`,
    [shopId, templateId, interval, keySuffix], db,
  )
}

/** Demo reset: delete every row of this shop, in the caller's transaction. */
export async function removeAllForShop(shopId, db) {
  requireShopId(shopId)
  await query('DELETE FROM ledger_entries WHERE shop_id = $1', [shopId], db)
}

/** Activity in a period: count and total of ledger entries per type (INCOME, EXPENSE). */
export async function activityByType(shopId, from, to, db) {
  const { rows } = await query(`SELECT type,count(*)::int AS count,coalesce(sum(amount),0)::text AS amount
    FROM ledger_entries WHERE shop_id=$1 AND occurred_at >= $2 AND occurred_at < $3 GROUP BY type`, [shopId, from, to], db)
  return rows
}
