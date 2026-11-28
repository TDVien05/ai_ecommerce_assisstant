import { env } from '../../config/env.js'
import { pool, withTransaction } from '../../db/pool.js'
import { HttpError, forbidden, notFound } from '../../lib/httpError.js'
import { logger } from '../../lib/logger.js'
import { TEMPLATE_PAGE_ID } from '../../db/seed.js'

/**
 * Demo shops: every judge session gets its own copy of the seeded template shop, so two
 * people clicking at the same time never edit the same rows. Copies are deleted after
 * DEMO_SHOP_TTL_HOURS by an hourly job (see index.js).
 */

export async function findTemplate(db = pool) {
  const { rows } = await db.query(
    'SELECT id, name, bank_code, bank_account_number, bank_account_name FROM shops WHERE fb_page_id = $1',
    [TEMPLATE_PAGE_ID],
  )
  return rows[0] ?? null
}

export async function createDemoShop({ ownerName = 'Khách tham quan', passwordHash = 'x' } = {}) {
  const template = await findTemplate()
  if (!template) throw new HttpError(503, 'DEMO_UNAVAILABLE', 'Shop mẫu chưa có. Chạy `npm run seed` trước.')

  return withTransaction(async (client) => {
    const shop = await client.query(
      `INSERT INTO shops (name, bank_code, bank_account_number, bank_account_name, is_demo, demo_expires_at)
       VALUES ($1, $2, $3, $4, true, now() + make_interval(hours => $5))
       RETURNING id, name, demo_expires_at`,
      [`${template.name} · bản thử`, template.bank_code, template.bank_account_number,
        template.bank_account_name, env.DEMO_SHOP_TTL_HOURS],
    )
    const shopId = shop.rows[0].id
    const user = await client.query(
      `INSERT INTO users (shop_id, email, password_hash, owner_name)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [shopId, `demo-${shopId.slice(0, 8)}@flowy.local`, passwordHash, ownerName],
    )

    await copyTemplate(client, shopId, template.id)
    return {
      shopId,
      userId: user.rows[0].id,
      name: shop.rows[0].name,
      expiresAt: shop.rows[0].demo_expires_at,
    }
  })
}

/** Put a demo shop back to the template data, keeping the same shop id and user. */
export async function resetDemoShop(shopId) {
  const shop = await pool.query('SELECT id, is_demo FROM shops WHERE id = $1', [shopId])
  if (!shop.rows[0]) throw notFound('Không tìm thấy shop.')
  if (!shop.rows[0].is_demo) throw forbidden('Chỉ shop thử mới được đặt lại dữ liệu.')

  const template = await findTemplate()
  if (!template) throw new HttpError(503, 'DEMO_UNAVAILABLE', 'Shop mẫu chưa có. Chạy `npm run seed` trước.')

  return withTransaction(async (client) => {
    for (const table of ['customers', 'products', 'ledger_entries', 'payment_transactions', 'todos', 'blocklist', 'labels', 'fraud_checks', 'conversations']) {
      await client.query(`DELETE FROM ${table} WHERE shop_id = $1`, [shopId])
    }
    await copyTemplate(client, shopId, template.id)
    await client.query(
      'UPDATE shops SET demo_expires_at = now() + make_interval(hours => $2) WHERE id = $1',
      [shopId, env.DEMO_SHOP_TTL_HOURS],
    )
    return { shopId, reset: true }
  })
}

/** Hourly job: drop demo shops whose TTL passed (everything cascades from shops). */
export async function deleteExpiredDemoShops(now = new Date()) {
  const { rows } = await pool.query(
    'SELECT id, name FROM shops WHERE is_demo AND demo_expires_at IS NOT NULL AND demo_expires_at < $1',
    [now],
  )
  for (const shop of rows) {
    await pool.query('DELETE FROM shops WHERE id = $1', [shop.id])
    logger.info({ shopId: shop.id, name: shop.name }, 'expired demo shop deleted')
  }
  return rows.length
}

/**
 * One INSERT ... SELECT per table. Every date column is shifted so that the newest template
 * order lands "now"; the demo therefore always looks like the last 30 days of trading.
 */
async function copyTemplate(client, shopId, templateId) {
  // sepay_id is globally unique; copies draw from their own sequence so two judges clicking
  // at the same moment never collide.
  await client.query('CREATE SEQUENCE IF NOT EXISTS demo_sepay_seq START 1000000')

  const shift = await client.query(
    `SELECT (now() - COALESCE(max(created_at), now()))::text AS shift
       FROM orders WHERE shop_id = $1`,
    [templateId],
  )
  const interval = shift.rows[0].shift
  const suffix = shopId.slice(0, 4)
  const three = [shopId, templateId, interval]
  const params = [shopId, templateId, interval, suffix]
  const messageParams = [shopId, templateId, interval, shopId.slice(0, 8)]
  const pair = [shopId, templateId]

  await client.query(
    `INSERT INTO products (shop_id, sku, name, description, price, cost, stock, variants, image_url, is_active)
     SELECT $1, sku, name, description, price, cost, stock, variants, image_url, is_active
       FROM products WHERE shop_id = $2`,
    pair,
  )

  await client.query(
    `INSERT INTO customers (shop_id, psid, name, phone, address)
     SELECT $1, psid, name, phone, address FROM customers WHERE shop_id = $2`,
    pair,
  )

  await client.query(
    `INSERT INTO conversations (shop_id, customer_id, ai_paused)
     SELECT $1, nc.id, oc.ai_paused
       FROM conversations oc
       JOIN customers tc ON tc.id = oc.customer_id
       JOIN customers nc ON nc.shop_id = $1 AND nc.psid = tc.psid
      WHERE oc.shop_id = $2`,
    pair,
  )

  await client.query(
    `INSERT INTO messages (conversation_id, mid, role, content, created_at)
     SELECT nconv.id, m.mid || ':' || $4, m.role, m.content, m.created_at + $3::interval
       FROM messages m
       JOIN conversations oc ON oc.id = m.conversation_id
       JOIN customers tc ON tc.id = oc.customer_id
       JOIN customers nc ON nc.shop_id = $1 AND nc.psid = tc.psid
       JOIN conversations nconv ON nconv.shop_id = $1 AND nconv.customer_id = nc.id
      WHERE oc.shop_id = $2`,
    messageParams,
  )

  // Temporary map old order id → new order id for the child tables.
  await client.query(`
    CREATE TEMP TABLE demo_order_map ON COMMIT DROP AS
    SELECT o.id AS old_id, gen_random_uuid() AS new_id
      FROM orders o WHERE o.shop_id = $1`, [templateId])

  await client.query(
    `INSERT INTO orders (id, shop_id, customer_id, payment_code, status, risk_level, subtotal, shipping_fee,
                         total, shipping_name, shipping_phone, shipping_address, expires_at, paid_at, created_at)
     SELECT m.new_id, $1, nc.id, o.payment_code || '-' || $4, o.status, o.risk_level,
            o.subtotal, o.shipping_fee, o.total, o.shipping_name, o.shipping_phone, o.shipping_address,
            o.expires_at + $3::interval, o.paid_at + $3::interval, o.created_at + $3::interval
       FROM orders o
       JOIN demo_order_map m ON m.old_id = o.id
       JOIN customers tc ON tc.id = o.customer_id
       JOIN customers nc ON nc.shop_id = $1 AND nc.psid = tc.psid
      WHERE o.shop_id = $2`,
    params,
  )

  await client.query(
    `INSERT INTO order_items (order_id, product_id, name_snapshot, variant, unit_price, unit_cost, quantity)
     SELECT m.new_id, np.id, oi.name_snapshot, oi.variant, oi.unit_price, oi.unit_cost, oi.quantity
       FROM order_items oi
       JOIN demo_order_map m ON m.old_id = oi.order_id
       LEFT JOIN products tp ON tp.id = oi.product_id
       LEFT JOIN products np ON np.shop_id = $1 AND np.sku = tp.sku`,
    [shopId],
  )

  await client.query(
    `INSERT INTO ledger_entries (shop_id, type, category, amount, order_id, note, occurred_at, source,
                                 counterparty, raw_description, dedupe_key)
     SELECT $1, l.type, l.category, l.amount, m.new_id, l.note, l.occurred_at + $3::interval, l.source,
            l.counterparty, l.raw_description,
            l.dedupe_key || ':' || $4
       FROM ledger_entries l
       LEFT JOIN demo_order_map m ON m.old_id = l.order_id
      WHERE l.shop_id = $2`,
    params,
  )

  await client.query(
    `INSERT INTO payment_transactions (shop_id, sepay_id, gateway, account_number, code, content,
                                       reference_code, transfer_type, transfer_amount, transaction_date,
                                       order_id, match_status, raw)
     SELECT $1, nextval('demo_sepay_seq'), t.gateway, t.account_number,
            CASE WHEN t.code IS NULL THEN NULL ELSE t.code || '-' || $4 END,
            t.content, t.reference_code, t.transfer_type, t.transfer_amount,
            t.transaction_date + $3::interval, m.new_id, t.match_status, t.raw
       FROM payment_transactions t
       LEFT JOIN demo_order_map m ON m.old_id = t.order_id
      WHERE t.shop_id = $2`,
    params,
  )

  await client.query(
    `INSERT INTO fraud_checks (shop_id, provider, external_id, level, rule, reason, metadata, created_at)
     SELECT $1, provider, external_id, level, rule, reason, metadata, created_at + $3::interval
       FROM fraud_checks WHERE shop_id = $2`,
    three,
  )

  await client.query(
    `INSERT INTO labels (shop_id, name, color) SELECT $1, name, color FROM labels WHERE shop_id = $2`,
    pair,
  )

  await client.query(
    `INSERT INTO blocklist (shop_id, kind, value, reason) SELECT $1, kind, value, reason FROM blocklist WHERE shop_id = $2`,
    pair,
  )

  await client.query(
    `INSERT INTO todos (shop_id, title, detail, status, due_at)
     SELECT $1, title, detail, status, due_at + $3::interval FROM todos WHERE shop_id = $2`,
    three,
  )
}
