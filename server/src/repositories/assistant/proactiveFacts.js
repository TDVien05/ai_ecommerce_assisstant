import { query } from '../../config/database.js'
import { requireShopId } from '../guard.js'

export async function ledgerFacts(shopId, { yearStart, monthStart, weekStart, historyStart, now }, client) {
  requireShopId(shopId)
  const { rows: [facts] } = await query(`SELECT
    COALESCE(sum(amount) FILTER (
      WHERE occurred_at >= $2 AND type = 'INCOME' AND kind = 'BUSINESS_REVENUE'), 0)::text AS revenue,
    count(*) FILTER (WHERE occurred_at >= $3 AND (
      kind IS NULL OR (type = 'INCOME' AND kind = 'EXPENSE') OR (type = 'EXPENSE' AND kind = 'BUSINESS_REVENUE')
    ))::int AS unclassified,
    COALESCE(sum(amount) FILTER (
      WHERE occurred_at >= $4 AND type = 'EXPENSE' AND kind = 'EXPENSE'), 0)::text AS expenses,
    COALESCE(sum(amount) FILTER (
      WHERE occurred_at < $4 AND type = 'EXPENSE' AND kind = 'EXPENSE'), 0)::text AS prior_expenses,
    count(DISTINCT date_trunc('week', occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh')) FILTER (
      WHERE occurred_at < $4 AND type = 'EXPENSE' AND kind = 'EXPENSE')::int AS prior_weeks
    FROM ledger_entries WHERE shop_id = $1 AND occurred_at >= LEAST($2, $5) AND occurred_at < $6`,
  [shopId, yearStart, monthStart, weekStart, historyStart, now], client)
  return facts
}

export async function riskyOrders(shopId, since, now, client) {
  requireShopId(shopId)
  const { rows } = await query(`WITH high_checks AS (
      SELECT t.order_id FROM fraud_checks f
      JOIN payment_transactions t ON t.shop_id = f.shop_id AND t.sepay_id::text = f.external_id
      WHERE f.shop_id = $1 AND f.provider = 'sepay' AND f.level = 'HIGH'
        AND f.created_at >= $2 AND f.created_at <= $3 AND t.order_id IS NOT NULL
    )
    SELECT o.id, o.payment_code FROM orders o
    WHERE o.shop_id = $1 AND o.status IN ('AWAITING_PAYMENT', 'PAID', 'SHIPPING', 'SHIPPED', 'LIKELY_DELIVERED')
      AND (o.risk_level = 'HIGH' OR o.id IN (SELECT order_id FROM high_checks))
      AND NOT EXISTS (
        SELECT 1 FROM assistant_alerts a JOIN assistant_messages m ON m.shop_id = a.shop_id AND m.id = 'notice-' || a.id
        WHERE a.shop_id = o.shop_id AND a.order_id = o.id
      )
    ORDER BY o.created_at DESC, o.id`, [shopId, since, now], client)
  return rows
}

export async function unmatchedHighChecks(shopId, since, now, client) {
  requireShopId(shopId)
  const { rows: [facts] } = await query(`SELECT count(*)::int AS count FROM fraud_checks f
    WHERE f.shop_id = $1 AND f.level = 'HIGH' AND f.created_at >= $2 AND f.created_at <= $3
      AND NOT EXISTS (SELECT 1 FROM payment_transactions t WHERE f.provider = 'sepay'
        AND t.shop_id = f.shop_id AND t.sepay_id::text = f.external_id AND t.order_id IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM assistant_alerts a JOIN assistant_messages m ON m.shop_id = a.shop_id AND m.id = 'notice-' || a.id
        WHERE a.shop_id = f.shop_id AND a.order_id IS NULL AND a.level = 'high'
          AND a.detected_at >= $2
      )`, [shopId, since, now], client)
  return facts.count
}

export async function overdueCount(shopId, now, client) {
  requireShopId(shopId)
  const { rows: [facts] } = await query(`SELECT count(*)::int AS count FROM orders
    WHERE shop_id = $1 AND status = 'AWAITING_PAYMENT' AND expires_at <= $2`, [shopId, now], client)
  return facts.count
}
