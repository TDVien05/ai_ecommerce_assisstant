import { pool } from '../pool.js'

const filter = "l.shop_id = $1 AND ($2::timestamptz IS NULL OR l.occurred_at >= $2) AND ($3::timestamptz IS NULL OR l.occurred_at < $3)"

export async function ledger(shopId, { from = null, to = null, type = null }) {
  const { rows } = await pool.query(`SELECT l.id,l.type,l.kind,l.channel,l.category,l.document_ref,l.document_date,l.industry,l.amount,l.order_id,o.payment_code AS order_code,l.note,l.occurred_at,l.manual
    FROM ledger_entries l LEFT JOIN orders o ON o.id = l.order_id AND o.shop_id = l.shop_id
    WHERE ${filter} AND ($4::text IS NULL OR l.type = $4) ORDER BY l.occurred_at DESC,l.id`, [shopId, from, to, type])
  return rows
}

export async function counts(shopId, { from = null, to = null }) {
  const { rows } = await pool.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE l.kind IS NULL)::int AS unknown,
    count(*) FILTER (WHERE l.kind = 'BUSINESS_REVENUE' AND l.type = 'INCOME' AND (l.order_id IS NULL OR NOT EXISTS (SELECT 1 FROM orders o WHERE o.id=l.order_id AND o.shop_id=l.shop_id)))::int AS missing_cost
    FROM ledger_entries l WHERE ${filter}`, [shopId, from, to])
  return rows[0]
}

export async function summary(shopId, { from = null, to = null }) {
  const { rows } = await pool.query(`WITH entries AS (SELECT l.* FROM ledger_entries l WHERE ${filter}),
    revenue AS (SELECT COALESCE(sum(amount) FILTER (WHERE kind='BUSINESS_REVENUE' AND type='INCOME'),0)::numeric AS amount,
      COALESCE(sum(amount) FILTER (WHERE kind='EXPENSE' AND type='EXPENSE'),0)::numeric AS expense FROM entries),
    order_revenue AS (SELECT order_id, sum(amount)::numeric AS amount FROM entries WHERE kind='BUSINESS_REVENUE' AND type='INCOME' AND order_id IS NOT NULL GROUP BY order_id),
    item_cost AS (SELECT oi.order_id,sum(oi.unit_cost::numeric * oi.quantity)::numeric AS amount FROM order_items oi JOIN order_revenue r ON r.order_id=oi.order_id JOIN orders o ON o.id=oi.order_id AND o.shop_id=$1 GROUP BY oi.order_id),
    orders AS (SELECT count(*)::int AS count, COALESCE(sum(r.amount),0)::numeric AS revenue, COALESCE(sum(c.amount),0)::numeric AS cost, count(*) FILTER (WHERE c.order_id IS NULL)::int AS missing_items FROM order_revenue r LEFT JOIN item_cost c ON c.order_id=r.order_id)
    SELECT revenue.amount::text AS revenue,revenue.expense::text AS expenses,orders.cost::text AS cost,orders.revenue::text AS order_revenue,orders.count AS order_count,orders.missing_items FROM revenue CROSS JOIN orders`, [shopId, from, to])
  return rows[0]
}

export async function timeseries(shopId, { from = null, to = null, interval = 'day' }) {
  const { rows } = await pool.query(`SELECT date_trunc($4, l.occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS date, sum(l.amount)::text AS revenue
    FROM ledger_entries l WHERE ${filter} AND l.kind='BUSINESS_REVENUE' AND l.type='INCOME' GROUP BY 1 ORDER BY 1`, [shopId, from, to, interval])
  return rows
}

export async function topProducts(shopId, { from = null, to = null, limit = 5 }) {
  const { rows } = await pool.query(`WITH matched AS (SELECT DISTINCT l.order_id FROM ledger_entries l WHERE ${filter} AND l.kind='BUSINESS_REVENUE' AND l.type='INCOME' AND l.order_id IS NOT NULL)
    SELECT COALESCE(oi.product_id::text,oi.name_snapshot) AS product_id, oi.name_snapshot AS name, sum(oi.quantity)::text AS quantity, sum(oi.unit_price::numeric*oi.quantity)::text AS revenue
    FROM order_items oi JOIN matched m ON m.order_id=oi.order_id JOIN orders o ON o.id=oi.order_id AND o.shop_id=$1
    GROUP BY 1,2 ORDER BY sum(oi.unit_price::numeric*oi.quantity) DESC,1 LIMIT $4`, [shopId, from, to, limit])
  return rows
}
