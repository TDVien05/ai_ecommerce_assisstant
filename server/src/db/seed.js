import bcrypt from 'bcrypt'
import { pathToFileURL } from 'node:url'
import { env } from '../config/env.js'
import { pool, withTransaction } from './pool.js'

/**
 * Deterministic demo dataset: one template shop ("Lan Closet") with products, customers,
 * conversations, 60 orders across every state, ledger entries (including money-losing days),
 * SePay transactions, one fraud case and a few todos.
 *
 * `npm run seed` is idempotent: the template is marked by its fb_page_id; subsequent runs
 * only fill missing classifications, without adding rows. Each judge session gets a copy
 * (see repositories/shop/shop.repository.js + services/demo/demo.service.js).
 */

// The template's page id lives with the shops queries; re-exported here for the seed's callers.
import { TEMPLATE_PAGE_ID } from '../repositories/shop/shop.repository.js'
import { classifyTemplateEntries } from '../repositories/finance/ledgerEntry.repository.js'
export { TEMPLATE_PAGE_ID }

const SEED = 20261127

function createRandom(seed) {
  let state = seed
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const money = (value) => Math.round(value / 1000) * 1000

const PRODUCTS = [
  ['AT-TRANG-M', 'Áo thun trắng size M', 'Áo thun cotton 100%, form rộng, dễ phối đồ.', 150000, 80000, 32],
  ['AT-TRANG-L', 'Áo thun trắng size L', 'Áo thun cotton 100%, form rộng, dễ phối đồ.', 160000, 85000, 24],
  ['AT-DEN-M', 'Áo thun đen basic', 'Áo thun đen cotton compact, không xù lông.', 170000, 90000, 28],
  ['SO-MI-KE', 'Sơ mi kẻ sọc Hàn Quốc', 'Sơ mi tay dài, chất lụa mềm, có phối lớp.', 320000, 190000, 14],
  ['VAY-HOA', 'Váy hoa nhí dáng dài', 'Váy hai dây, lót trong, dài qua gối.', 380000, 220000, 10],
  ['VAY-BODY', 'Váy body ôm tôn dáng', 'Váy body co giãn 4 chiều.', 350000, 200000, 12],
  ['QUAN-JEAN', 'Quần jean ống rộng', 'Jean ống rộng, lưng cao, size 26-32.', 420000, 260000, 16],
  ['QUAN-TAY', 'Quần tây ống suông', 'Quần tây lưng cao, vải đứng form.', 390000, 240000, 9],
  ['QUAN-SHORT', 'Quần short kaki', 'Short kaki túi hộp, mặc nhà hoặc đi chơi.', 180000, 100000, 22],
  ['AO-KHOAC-BOM', 'Áo khoác bomber', 'Khoác bomber hai lớp, có mũ.', 520000, 340000, 7],
  ['AO-LEN', 'Áo len cổ lọ', 'Len trơn mềm, co giãn tốt.', 260000, 150000, 18],
  ['TUI-TOTE', 'Túi tote canvas', 'Túi vải canvas có quai da, đựng laptop 14 inch.', 210000, 110000, 25],
  ['VI-DA', 'Ví da mini', 'Ví da PU, nhiều ngăn, có khóa kéo.', 160000, 85000, 30],
  ['KINH-GONG', 'Kính gọng vuông', 'Gọng nhựa dẻo, chống UV400.', 140000, 60000, 26],
  ['DAY-CHUYEN', 'Dây chuyền bạc mảnh', 'Bạc 925, dài 45cm, chống xỉn màu.', 240000, 140000, 11],
  ['BOPP-NHO', 'Bóp cầm tay nữ', 'Bóp mini cầm tay, có dây đeo.', 190000, 100000, 13],
  ['GIAY-SNEAKER', 'Giày sneaker trắng', 'Sneaker cổ thấp, đế cao su, size 35-40.', 480000, 320000, 8],
  ['TAT-CAO-CO', 'Set tất cổ cao (3 đôi)', 'Tất cotton, 3 đôi một set.', 80000, 35000, 40],
]

const CUSTOMER_NAMES = [
  'Nguyễn Thu Hà', 'Trần Minh Anh', 'Lê Hoài An', 'Phạm Thu Trang', 'Hoàng Gia Linh',
  'Vũ Ngọc Mai', 'Đặng Khánh Ly', 'Bùi Thanh Thảo', 'Đỗ Hồng Nhung', 'Ngô Bảo Châu',
  'Dương Yến Nhi', 'Lý Phương Thảo', 'Trịnh Thuỳ Dương', 'Mai Hạnh Nguyên', 'Tạ Kim Ngân',
  'Phan Thu Hương', 'Cao Minh Thư', 'Lưu Diệp Anh', 'Tôn Nữ Bảo Trân', 'Võ Thanh Huyền',
  'Đinh Quỳnh Anh', 'Hồ Tú Uyên', 'Âu Dương Kỳ', 'Chu Hải Yến', 'Thái Mai Chi',
]

// The dashboard and assistant read the lifecycle names SHIPPING/COMPLETED, so the sample
// data uses those (the SRS extras SHIPPED/LIKELY_DELIVERED/DELIVERED/FOLLOWED_UP stay valid
// in the DB constraint but are not seeded, to keep every status labelled in the UI).
const STATUS_FLOW = [
  'PAID', 'SHIPPING', 'COMPLETED', 'AWAITING_PAYMENT', 'EXPIRED', 'PAID', 'CANCELLED', 'SHIPPING',
  'SHIPPING', 'COMPLETED', 'PAID', 'COMPLETED', 'REFUNDED', 'SHIPPING', 'AWAITING_PAYMENT',
  'PAID', 'COMPLETED', 'EXPIRED', 'SHIPPING', 'CANCELLED', 'PAID', 'COMPLETED', 'SHIPPING',
  'SHIPPING', 'COMPLETED', 'PAID', 'EXPIRED', 'COMPLETED', 'CANCELLED', 'SHIPPING', 'PAID',
  'AWAITING_PAYMENT', 'COMPLETED', 'REFUNDED', 'SHIPPING', 'PAID', 'COMPLETED', 'COMPLETED',
  'EXPIRED', 'SHIPPING', 'PAID', 'CANCELLED', 'COMPLETED', 'SHIPPING', 'PAID', 'SHIPPING',
  'COMPLETED', 'COMPLETED', 'AWAITING_PAYMENT', 'PAID', 'SHIPPING', 'COMPLETED', 'REFUNDED',
  'PAID', 'CANCELLED', 'SHIPPING', 'COMPLETED', 'EXPIRED', 'SHIPPING', 'PAID', 'COMPLETED',
]

const PAID_STATES = new Set(['PAID', 'SHIPPING', 'COMPLETED', 'REFUNDED'])

const dayMs = 24 * 60 * 60 * 1000

export async function seed() {
  const existing = await pool.query('SELECT id FROM shops WHERE fb_page_id = $1', [TEMPLATE_PAGE_ID])
  if (existing.rows.length) {
    await withTransaction((client) => classifyTemplateEntries(existing.rows[0].id, client))
    console.log('Seed skipped: template shop already exists; missing classifications updated')
    return { skipped: true, shopId: existing.rows[0].id }
  }

  const random = createRandom(SEED)
  const shopId = await withTransaction(async (client) => {
    const shop = await client.query(
      `INSERT INTO shops (name, fb_page_id, bank_code, bank_account_number, bank_account_name)
       VALUES ('Lan Closet', $1, 'MB', '1017588888', 'LAN CLOSET')
       RETURNING id`,
      [TEMPLATE_PAGE_ID],
    )
    const shopId = shop.rows[0].id
    const now = Date.now()

    const productRows = []
    for (const [sku, name, description, price, cost, stock] of PRODUCTS) {
      const { rows } = await client.query(
        `INSERT INTO products (shop_id, sku, name, description, price, cost, stock, variants)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, sku, price, cost, name`,
        [shopId, sku, name, description, price, cost, stock,
          { size: ['S', 'M', 'L'], color: ['trắng', 'đen', 'be'] }],
      )
      productRows.push(rows[0])
    }

    const customers = []
    for (const [index, name] of CUSTOMER_NAMES.entries()) {
      const { rows } = await client.query(
        `INSERT INTO customers (shop_id, psid, name, phone, address) VALUES ($1, $2, $3, $4, $5)
         RETURNING id, psid, name`,
        [shopId, `psid-seed-${index + 1}`, name,
          index % 4 === 0 ? null : `09${String(10000000 + index * 137).slice(0, 8)}`,
          index % 3 === 0 ? null : `${index + 1} Nguyễn Trãi, Quận ${(index % 12) + 1}, TP.HCM`],
      )
      customers.push(rows[0])
    }

    // Conversations + a short history for the first 12 customers.
    for (const [index, customer] of customers.slice(0, 12).entries()) {
      const conversation = await client.query(
        'INSERT INTO conversations (shop_id, customer_id) VALUES ($1, $2) RETURNING id',
        [shopId, customer.id],
      )
      const conversationId = conversation.rows[0].id
      const lines = [
        ['user', 'Shop ơi, mẫu này còn size M không ạ?'],
        ['assistant', 'Dạ còn ạ, shop gửi bảng size và giá cho mình nhé.'],
        ['user', 'Ok shop, mình lấy một cái.'],
        ['assistant', 'Dạ shop tạo đơn rồi, mình chuyển khoản theo mã giúp shop nhé.'],
      ]
      for (const [lineIndex, [role, content]] of lines.entries()) {
        await client.query(
          `INSERT INTO messages (conversation_id, mid, role, content, created_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [conversationId, `mid-seed-${index + 1}-${lineIndex + 1}`, role, content,
            new Date(now - (index + 1) * dayMs + lineIndex * 60000)],
        )
      }
    }

    // Orders: 60 rows spread over the last 30 days, every status represented.
    for (const [index, status] of STATUS_FLOW.entries()) {
      const created = new Date(now - Math.floor(random() * 30) * dayMs - Math.floor(random() * 12) * 3600000)
      const paid = PAID_STATES.has(status)
      const paidAt = paid ? new Date(created.getTime() + Math.floor(1 + random() * 20) * 60000) : null
      const customer = customers[Math.floor(random() * customers.length)]
      const paymentCode = `DH${(100000 + index * 7).toString(36).toUpperCase()}`
      const lineCount = 1 + Math.floor(random() * 3)
      const items = []
      let subtotal = 0
      for (let line = 0; line < lineCount; line += 1) {
        const product = productRows[Math.floor(random() * productRows.length)]
        const quantity = 1 + Math.floor(random() * 2)
        subtotal += product.price * quantity
        items.push({ product, quantity })
      }
      const shippingFee = random() > 0.5 ? 30000 : 0
      const total = subtotal + shippingFee
      const order = await client.query(
        `INSERT INTO orders (shop_id, customer_id, payment_code, status, risk_level, subtotal, shipping_fee,
                             total, shipping_name, shipping_phone, shipping_address, expires_at, paid_at,
                             created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
        [shopId, customer.id, paymentCode, status, status === 'REFUNDED' ? 'MEDIUM' : 'LOW',
          subtotal, shippingFee, total, customer.name, '09' + String(10000000 + index * 91).slice(0, 8),
          `${index + 1} Lê Lợi, Quận 1, TP.HCM`,
          new Date(created.getTime() + 30 * 60000), paidAt, created],
      )
      for (const { product, quantity } of items) {
        await client.query(
          `INSERT INTO order_items (order_id, product_id, name_snapshot, variant, unit_price, unit_cost, quantity)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [order.rows[0].id, product.id, product.name, { size: 'M', color: 'trắng' },
            product.price, product.cost, quantity],
        )
      }

      if (paid) {
        await client.query(
          `INSERT INTO ledger_entries (shop_id, type, category, amount, order_id, note, occurred_at, source,
                                       counterparty, dedupe_key, kind, manual)
           VALUES ($1, 'INCOME', 'SALES', $2, $3, $4, $5, 'order', $6, $7, 'BUSINESS_REVENUE', false)`,
          [shopId, total, order.rows[0].id, `Thu tiền đơn ${paymentCode}`, paidAt, customer.name,
            `seed:order:${paymentCode}`],
        )
        await client.query(
          `INSERT INTO payment_transactions (shop_id, sepay_id, gateway, account_number, code, content,
                                             reference_code, transfer_type, transfer_amount, transaction_date,
                                             order_id, match_status, raw)
           VALUES ($1, $2, 'MB', '1017588888', $3, $4, $5, 'in', $6, $7, $8, 'MATCHED', '{}'::jsonb)`,
          [shopId, 900000 + index, paymentCode, `${paymentCode} chuyen tien`, `FT${900000 + index}`,
            total, paidAt, order.rows[0].id],
        )
      }
    }

    // Fixed costs so some days run negative: inventory, ads, shipping, rent.
    for (let day = 0; day < 30; day += 1) {
      const occurredAt = new Date(now - day * dayMs)
      if (day % 7 === 0) {
        await client.query(
          `INSERT INTO ledger_entries (shop_id, type, category, amount, note, occurred_at, source, counterparty)
           VALUES ($1, 'EXPENSE', 'INVENTORY', $2, 'Nhập hàng lô mới', $3, 'manual', 'Xưởng may Bình Tân')`,
          [shopId, money(1800000 + random() * 2200000), occurredAt],
        )
      }
      if (day === 4) {
        await client.query(
          `INSERT INTO ledger_entries (shop_id, type, category, amount, note, occurred_at, source, counterparty)
           VALUES ($1, 'EXPENSE', 'INVENTORY', 6200000, 'Nhập hàng đợt thu đông', $2, 'manual', 'Xưởng may Bình Tân')`,
          [shopId, occurredAt],
        )
      }
      if (day % 3 === 0) {
        await client.query(
          `INSERT INTO ledger_entries (shop_id, type, category, amount, note, occurred_at, source, counterparty)
           VALUES ($1, 'EXPENSE', 'ADS', $2, 'Chạy quảng cáo Facebook', $3, 'manual', 'Meta')`,
          [shopId, money(300000 + random() * 400000), occurredAt],
        )
      }
      if (day % 5 === 0) {
        await client.query(
          `INSERT INTO ledger_entries (shop_id, type, category, amount, note, occurred_at, source, counterparty)
           VALUES ($1, 'EXPENSE', 'SHIPPING', $2, 'Trả phí vận chuyển tuần', $3, 'manual', 'GHN')`,
          [shopId, money(150000 + random() * 200000), occurredAt],
        )
      }
    }
    await client.query(
      `INSERT INTO ledger_entries (shop_id, type, category, amount, note, occurred_at, source, counterparty)
       VALUES ($1, 'EXPENSE', 'OTHER', 1500000, 'Tiền mặt bằng tháng 11', $2, 'manual', 'Chủ nhà')`,
      [shopId, new Date(now - 29 * dayMs)],
    )

    // Labels + a couple of open todos + one blocked customer.
    for (const [name, color] of [['Nhập hàng', '#f97316'], ['Quảng cáo', '#3b82f6'], ['Vận chuyển', '#22c55e'], ['Mặt bằng', '#a855f7']]) {
      await client.query('INSERT INTO labels (shop_id, name, color) VALUES ($1, $2, $3)', [shopId, name, color])
    }
    await client.query(
      `INSERT INTO todos (shop_id, title, detail, due_at)
       VALUES ($1, 'Đối soát giao dịch thiếu tiền', 'Khách chuyển thiếu 50.000đ cho đơn DHUNDER01.', $2),
              ($1, 'Xác nhận đơn chuyển khoản lạ', 'Có giao dịch không kèm mã đơn, cần gán tay.', $2)`,
      [shopId, new Date(now + dayMs)],
    )
    await client.query(
      `INSERT INTO blocklist (shop_id, kind, value, reason) VALUES ($1, 'PSID', 'psid-seed-25', 'Spam nhiều lần')`,
      [shopId],
    )

    // SePay edge cases: underpaid, no code, and the fraud sample (money to a different account).
    const awaiting = await client.query(
      `SELECT o.id, o.payment_code, o.total FROM orders o
        WHERE o.shop_id = $1 AND o.status = 'AWAITING_PAYMENT' ORDER BY o.created_at LIMIT 1`,
      [shopId],
    )
    const target = awaiting.rows[0]
    if (target) {
      await client.query(
        `INSERT INTO payment_transactions (shop_id, sepay_id, gateway, account_number, code, content,
                                           reference_code, transfer_type, transfer_amount, transaction_date,
                                           order_id, match_status, raw)
         VALUES ($1, 950001, 'MB', '1017588888', 'DHUNDER01', 'DHUNDER01 chuyen tien', 'FT950001', 'in', $2, now(), $3, 'UNDERPAID', '{}'::jsonb)`,
        [shopId, Math.max(10000, target.total - 50000), target.id],
      )
    }
    await client.query(
      `INSERT INTO payment_transactions (shop_id, sepay_id, gateway, account_number, code, content,
                                         reference_code, transfer_type, transfer_amount, transaction_date,
                                         match_status, raw)
       VALUES ($1, 950002, 'MB', '1017588888', NULL, 'chuyen tien mua hang', 'FT950002', 'in', 180000, now(), 'NO_ORDER', '{}'::jsonb)`,
      [shopId],
    )
    await client.query(
      `INSERT INTO payment_transactions (shop_id, sepay_id, gateway, account_number, code, content,
                                         reference_code, transfer_type, transfer_amount, transaction_date,
                                         match_status, raw)
       VALUES ($1, 950003, 'VCB', '9999999999', 'DHFRAUD01', 'DHFRAUD01 chuyen tien', 'FT950003', 'in', 250000, now(), 'NO_ORDER', '{}'::jsonb)`,
      [shopId],
    )
    await client.query(
      `INSERT INTO fraud_checks (shop_id, provider, external_id, level, rule, reason, metadata)
       VALUES ($1, 'sepay', '950003', 'HIGH', 'wrong_receiving_account',
               'Số tài khoản nhận không phải của shop.', '{"received":"9999999999","expected":"1017588888"}'::jsonb),
              ($1, 'sepay', '900001', 'LOW', 'passed', 'Không vi phạm luật cứng nào.', '{}'::jsonb),
              ($1, 'messenger', 'mid-seed-1-1', 'LOW', 'passed', 'Không vi phạm luật cứng nào.', '{}'::jsonb)`,
      [shopId],
    )

    await classifyTemplateEntries(shopId, client)
    return shopId
  })

  await seedDemoAccount()
  console.log('Seed done: shop "Lan Closet"')
  return { skipped: false, shopId }
}

async function seedDemoAccount() {
  if (!env.DEMO_EMAIL || !env.DEMO_PASSWORD) {
    console.log('Demo account skipped: DEMO_EMAIL or DEMO_PASSWORD missing')
    return
  }
  if (Buffer.byteLength(env.DEMO_PASSWORD, 'utf8') > 72) throw new Error('DEMO_PASSWORD exceeds 72 bytes')
  const email = env.DEMO_EMAIL.trim().toLowerCase()
  const hash = await bcrypt.hash(env.DEMO_PASSWORD, 10)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [email])
    if (existing.rows.length) {
      await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, existing.rows[0].id])
    } else {
      const shop = await client.query('SELECT id FROM shops WHERE fb_page_id = $1', [TEMPLATE_PAGE_ID])
      const shopId = shop.rows[0]?.id ?? (await client.query('INSERT INTO shops (name) VALUES ($1) RETURNING id', ['Cửa hàng demo'])).rows[0].id
      await client.query(
        'INSERT INTO users (shop_id, email, password_hash) VALUES ($1, $2, $3)',
        [shopId, email, hash],
      )
    }
    await client.query('COMMIT')
    console.log('Demo account seeded')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

// `node src/db/seed.js` runs it; importing the module (tests, services) does not.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seed()
    .catch((error) => {
      console.error('Seed failed:', error.message)
      process.exitCode = 1
    })
    .finally(() => pool.end())
}
