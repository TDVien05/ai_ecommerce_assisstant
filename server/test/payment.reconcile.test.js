// Payment reconciliation (F5.3 / F5.4). Rules: docs/PAYMENT_ANTI_SCAM.md
// Every case runs against a real PostgreSQL and drives the real handler, not a stub.
process.env.NODE_ENV = 'test'
process.env.LOG_LEVEL = 'fatal'
process.env.JWT_SECRET = 'test-secret-only'

import { test, after } from 'node:test'
import assert from 'node:assert/strict'

const { createShop, dropShops, dbAvailable, pool } = await import('../test-support/db.js')
const reconcile = await import('../src/services/payments/reconcile.service.js')
const expiry = await import('../src/services/orders/expiry.service.js')
const orderRepo = await import('../src/repositories/orders/order.repository.js')
const paymentLib = await import('../src/lib/payment.js')

after(async () => { await pool.end() })

let counter = 0
const nextCode = () => `DHTEST${String(++counter).padStart(4, '0')}`

async function makeShop() {
  const account = `50${String(Date.now()).slice(-7)}${Math.floor(Math.random() * 10)}`
  return createShop(`reconcile-${Date.now()}-${Math.random()}`, {
    bank_code: 'MB',
    bank_account_number: account,
  })
}

/** An order plus its product line, so stock movements have something to move. */
async function makeOrder(shop, { total = 250000, quantity = 2, status = 'AWAITING_PAYMENT', expiresInMinutes = 30 } = {}) {
  const customer = await pool.query(
    'INSERT INTO customers (shop_id, psid) VALUES ($1, $2) RETURNING id',
    [shop.id, `psid-${Date.now()}-${Math.random()}`],
  )
  const product = await pool.query(
    `INSERT INTO products (shop_id, name, price, cost, stock) VALUES ($1, 'Test', 100000, 50000, 10) RETURNING id`,
    [shop.id],
  )
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000)
  const { rows } = await pool.query(
    `INSERT INTO orders (shop_id, customer_id, payment_code, status, subtotal, total, expires_at)
     VALUES ($1,$2,$3,$4,$5,$5,$6) RETURNING *`,
    [shop.id, customer.rows[0].id, nextCode(), status, total, expiresAt],
  )
  const order = rows[0]
  await pool.query(
    `INSERT INTO order_items (order_id, product_id, name_snapshot, unit_price, unit_cost, quantity)
     VALUES ($1,$2,'Test',100000,50000,$3)`,
    [order.id, product.rows[0].id, quantity],
  )
  return { order, productId: product.rows[0].id }
}

function payloadFor(shop, order, overrides = {}) {
  return {
    id: Number(`${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-11)),
    gateway: 'MB',
    transactionDate: '2026-11-28 15:20:00',
    accountNumber: shop.bank_account_number,
    code: order?.payment_code ?? null,
    content: order ? `${order.payment_code} chuyen tien` : 'chuyen tien',
    transferType: 'in',
    transferAmount: order ? Number(order.total) : 100000,
    referenceCode: `FT${Date.now()}`,
    ...overrides,
  }
}

async function statusOf(orderId) {
  const { rows } = await pool.query('SELECT status FROM orders WHERE id = $1', [orderId])
  return rows[0]?.status ?? null
}

async function stockOf(productId) {
  const { rows } = await pool.query('SELECT stock FROM products WHERE id = $1', [productId])
  return rows[0]?.stock ?? null
}

async function todosOf(shopId) {
  const { rows } = await pool.query('SELECT title, detail, order_id FROM todos WHERE shop_id = $1 ORDER BY id', [shopId])
  return rows
}

async function paymentsOf(shopId) {
  const { rows } = await pool.query('SELECT match_status, order_id, sepay_id FROM payment_transactions WHERE shop_id = $1 ORDER BY id', [shopId])
  return rows
}

test('đủ tiền: AWAITING_PAYMENT → PAID, ghi ledger INCOME, trừ tồn kho', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  try {
    const { order, productId } = await makeOrder(shop, { total: 250000, quantity: 2 })
    const before = await stockOf(productId)

    const result = await reconcile.reconcilePayment({
      shopId: shop.id, eventId: 1, payload: payloadFor(shop, order),
    })

    assert.equal(result.outcome, 'PAID')
    assert.equal(await statusOf(order.id), 'PAID')
    assert.equal(await stockOf(productId), before - 2, 'trừ đúng 2 tồn kho')

    const { rows: paid } = await pool.query('SELECT paid_at FROM orders WHERE id = $1', [order.id])
    assert.ok(paid[0].paid_at, 'paid_at phải được ghi')

    const { rows: ledger } = await pool.query(
      "SELECT type, kind, amount, order_id FROM ledger_entries WHERE shop_id = $1 AND order_id = $2",
      [shop.id, order.id],
    )
    assert.deepEqual(ledger, [{ type: 'INCOME', kind: 'BUSINESS_REVENUE', amount: 250000, order_id: order.id }])
    assert.deepEqual((await paymentsOf(shop.id)).map((p) => p.match_status), ['MATCHED'])
  } finally {
    await dropShops(shop.id)
  }
})

test('thiếu tiền: giữ AWAITING_PAYMENT, match_status UNDERPAID, tạo Việc cần làm', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  try {
    const { order, productId } = await makeOrder(shop, { total: 250000, quantity: 2 })
    const before = await stockOf(productId)

    const result = await reconcile.reconcilePayment({
      shopId: shop.id, eventId: 2,
      payload: payloadFor(shop, order, { transferAmount: 200000 }),
    })

    assert.equal(result.outcome, 'UNDERPAID')
    assert.equal(result.shortfall, 50000)
    assert.equal(await statusOf(order.id), 'AWAITING_PAYMENT', 'không tự duyệt')
    assert.equal(await stockOf(productId), before, 'không đụng tồn kho')
    assert.deepEqual((await paymentsOf(shop.id)).map((p) => p.match_status), ['UNDERPAID'])

    const todos = await todosOf(shop.id)
    assert.equal(todos.length, 1)
    assert.match(todos[0].title, /chuyển thiếu/)
    assert.match(todos[0].detail, /50\.000/)
  } finally {
    await dropShops(shop.id)
  }
})

test('dư tiền: vẫn PAID nhưng ghi nhận số dư cho chủ shop kiểm tra', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  try {
    const { order } = await makeOrder(shop, { total: 250000 })

    const result = await reconcile.reconcilePayment({
      shopId: shop.id, eventId: 3,
      payload: payloadFor(shop, order, { transferAmount: 300000 }),
    })

    assert.equal(result.outcome, 'PAID')
    assert.equal(await statusOf(order.id), 'PAID')
    // The ledger records what actually arrived, so the books match the bank statement.
    const { rows } = await pool.query(
      'SELECT amount FROM ledger_entries WHERE shop_id = $1 AND order_id = $2',
      [shop.id, order.id],
    )
    assert.equal(rows[0].amount, 300000)
  } finally {
    await dropShops(shop.id)
  }
})

test('đơn đã hết hạn: không tự duyệt, vẫn ghi nhận tiền và tạo Việc cần làm', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  try {
    const { order } = await makeOrder(shop, { status: 'EXPIRED' })

    const result = await reconcile.reconcilePayment({
      shopId: shop.id, eventId: 4, payload: payloadFor(shop, order),
    })

    assert.equal(result.outcome, 'LATE_PAYMENT')
    assert.equal(await statusOf(order.id), 'EXPIRED', 'không tự đổi sang PAID')
    assert.deepEqual((await paymentsOf(shop.id)).map((p) => p.match_status), ['MATCHED'], 'vẫn ghi nhận tiền')

    const todos = await todosOf(shop.id)
    assert.equal(todos.length, 1)
    assert.match(todos[0].title, /hết hạn/)
    assert.equal(todos[0].order_id, order.id)
  } finally {
    await dropShops(shop.id)
  }
})

test('cùng một sepay_id gửi hai lần: chỉ đối soát một lần', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  try {
    const { order, productId } = await makeOrder(shop, { total: 250000, quantity: 2 })
    const before = await stockOf(productId)
    const payload = payloadFor(shop, order)

    const first = await reconcile.reconcilePayment({ shopId: shop.id, eventId: 5, payload })
    const second = await reconcile.reconcilePayment({ shopId: shop.id, eventId: 5, payload })

    assert.equal(first.outcome, 'PAID')
    assert.equal(second.outcome, 'DUPLICATE')
    assert.equal(await statusOf(order.id), 'PAID')
    assert.equal(await stockOf(productId), before - 2, 'chỉ trừ tồn kho một lần')

    const ledger = await pool.query(
      'SELECT count(*)::int AS n FROM ledger_entries WHERE shop_id = $1 AND order_id = $2',
      [shop.id, order.id],
    )
    assert.equal(ledger.rows[0].n, 1, 'chỉ một dòng thu')
  } finally {
    await dropShops(shop.id)
  }
})

test('sai payment_code: match_status NO_ORDER, không đụng đơn nào, tạo Việc cần làm', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  try {
    const { order } = await makeOrder(shop, { total: 250000 })

    const result = await reconcile.reconcilePayment({
      shopId: shop.id, eventId: 6,
      payload: payloadFor(shop, order, { code: 'DHKHONGPHAI', content: 'DHKHONGPHAI chuyen tien' }),
    })

    assert.equal(result.outcome, 'NO_ORDER')
    assert.equal(await statusOf(order.id), 'AWAITING_PAYMENT')
    assert.deepEqual((await paymentsOf(shop.id)).map((p) => p.match_status), ['NO_ORDER'])
    assert.match((await todosOf(shop.id))[0].title, /không khớp đơn/)
  } finally {
    await dropShops(shop.id)
  }
})

test('giao dịch tiền ra: bỏ qua hoàn toàn, không đổi đơn', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  try {
    const { order } = await makeOrder(shop, { total: 250000 })

    const result = await reconcile.reconcilePayment({
      shopId: shop.id, eventId: 7,
      payload: payloadFor(shop, order, { transferType: 'out' }),
    })

    assert.equal(result.outcome, 'IGNORED')
    assert.equal(result.reason, 'outgoing_transfer')
    assert.equal(await statusOf(order.id), 'AWAITING_PAYMENT')
    assert.deepEqual((await paymentsOf(shop.id)).map((p) => p.match_status), ['IGNORED'])
  } finally {
    await dropShops(shop.id)
  }
})

test('sai tài khoản nhận: bỏ qua, không duyệt đơn của shop', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  try {
    const { order } = await makeOrder(shop, { total: 250000 })

    const result = await reconcile.reconcilePayment({
      shopId: shop.id, eventId: 8,
      payload: payloadFor(shop, order, { accountNumber: '9999999999' }),
    })

    assert.equal(result.outcome, 'IGNORED')
    assert.equal(result.reason, 'wrong_receiving_account')
    assert.equal(await statusOf(order.id), 'AWAITING_PAYMENT')
  } finally {
    await dropShops(shop.id)
  }
})

test('đơn đã PAID nhận thêm tiền: không đổi trạng thái, tạo Việc cần làm hoàn tiền', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  try {
    const { order } = await makeOrder(shop, { status: 'PAID', total: 250000 })

    const result = await reconcile.reconcilePayment({
      shopId: shop.id, eventId: 9, payload: payloadFor(shop, order),
    })

    assert.equal(result.outcome, 'ALREADY_PAID')
    assert.equal(await statusOf(order.id), 'PAID')
    assert.match((await todosOf(shop.id))[0].title, /nhận thêm/)
  } finally {
    await dropShops(shop.id)
  }
})

test('job hết hạn: đơn quá hạn → EXPIRED và nhả tồn kho', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  try {
    const { order, productId } = await makeOrder(shop, { total: 250000, quantity: 3, expiresInMinutes: -5 })
    const before = await stockOf(productId)

    const result = await expiry.expireOverdueOrders()

    assert.ok(result.expired >= 1)
    assert.equal(await statusOf(order.id), 'EXPIRED')
    assert.equal(await stockOf(productId), before + 3, 'nhả lại 3 tồn kho')
  } finally {
    await dropShops(shop.id)
  }
})

test('job hết hạn không đụng đơn còn hạn hoặc đã thanh toán', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  try {
    const fresh = await makeOrder(shop, { expiresInMinutes: 30 })
    const paid = await makeOrder(shop, { status: 'PAID', expiresInMinutes: -5 })

    await expiry.expireOverdueOrders()

    assert.equal(await statusOf(fresh.order.id), 'AWAITING_PAYMENT')
    assert.equal(await statusOf(paid.order.id), 'PAID')
  } finally {
    await dropShops(shop.id)
  }
})

test('sinh mã thanh toán: đúng tiền tố, độ dài, không có ký tự dễ nhầm', () => {
  for (let i = 0; i < 200; i += 1) {
    const code = paymentLib.generatePaymentCode()
    assert.match(code, /^DH[2-9A-HJ-NP-Z]{8}$/, code)
    assert.doesNotMatch(code, /[0O1I]/, code)
  }
  const codes = new Set(Array.from({ length: 500 }, () => paymentLib.generatePaymentCode()))
  assert.equal(codes.size, 500, 'không trùng trong 500 lần')
})

test('hạn thanh toán: 30 phút kể từ lúc tạo', () => {
  const from = new Date('2026-11-28T10:00:00Z')
  const deadline = paymentLib.paymentDeadline(from)
  assert.equal(deadline.getTime() - from.getTime(), 30 * 60 * 1000)
  assert.equal(paymentLib.PAYMENT_WINDOW_MINUTES, 30)
})

test('VietQR: dựng đúng URL với số tiền và nội dung, thiếu STK thì trả null', () => {
  const url = paymentLib.vietQrUrl({
    bankCode: 'MB', accountNumber: '1017588888', accountName: 'LAN CLOSET',
    amount: 250000, addInfo: 'DH8F3K2AB',
  })
  assert.match(url, /img\.vietqr\.io/)
  assert.match(url, /MB-1017588888/)
  assert.match(url, /amount=250000/)
  assert.match(url, /addInfo=DH8F3K2AB/)
  assert.equal(paymentLib.vietQrUrl({ bankCode: 'MB', accountNumber: null, amount: 1, addInfo: 'x' }), null)
})

test('tách mã thanh toán từ nội dung chuyển khoản bị ngân hàng chèn chữ', () => {
  assert.equal(paymentLib.extractPaymentCode('DH8F3K2AB chuyen tien'), 'DH8F3K2AB')
  assert.equal(paymentLib.extractPaymentCode('MBVCB.123456.DH8F3K2AB.CT tu 0123'), 'DH8F3K2AB')
  assert.equal(paymentLib.extractPaymentCode('dh8f3k2ab'), 'DH8F3K2AB')
  assert.equal(paymentLib.extractPaymentCode('chuyen tien mua hang'), null)
  assert.equal(paymentLib.extractPaymentCode(null), null)
})
