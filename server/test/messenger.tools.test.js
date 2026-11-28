// Bước 4: năm công cụ của bot Messenger.
// Điểm quan trọng nhất: model KHÔNG được truyền tiền. Giá và tổng tiền luôn đọc từ DB.
process.env.NODE_ENV = 'test'
process.env.LOG_LEVEL = 'fatal'
process.env.JWT_SECRET = 'test-secret-only'

import { test, after } from 'node:test'
import assert from 'node:assert/strict'

const { createShop, dropShops, dbAvailable, pool } = await import('../test-support/db.js')
const tools = await import('../src/services/messenger/tools/bot.tools.js')
const customerRepo = await import('../src/repositories/messenger/customer.repository.js')
const conversationRepo = await import('../src/repositories/messenger/conversation.repository.js')

after(async () => { await pool.end() })

const { searchProducts, getCustomerProfile, createOrder, checkPaymentStatus, handoverToHuman } = tools

async function makeShop(extra = {}) {
  return createShop(`tool-${Date.now()}-${Math.random()}`, {
    bank_code: 'MB',
    bank_account_number: `40${String(Date.now()).slice(-7)}${Math.floor(Math.random() * 10)}`,
    bank_account_name: 'SHOP TEST',
    ...extra,
  })
}

async function makeProduct(shopId, overrides = {}) {
  const { rows } = await pool.query(
    `INSERT INTO products (shop_id, sku, name, price, cost, stock, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, name, price, stock`,
    [shopId, overrides.sku ?? `SKU-${Math.random()}`, overrides.name ?? 'Áo thun trắng',
      overrides.price ?? 150000, overrides.cost ?? 80000, overrides.stock ?? 10, overrides.isActive ?? true],
  )
  return rows[0]
}

async function makeCustomer(shopId, psid, profile = {}) {
  return customerRepo.upsertByPsid(shopId, { psid, ...profile })
}

const ctxFor = (shopId, psid, conversationId = null) => ({ shopId, psid, conversationId })

// ---------------------------------------------------------------- search_products

test('search_products: chỉ trả sản phẩm còn bán của đúng shop', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  const other = await makeShop()
  try {
    await makeProduct(shop.id, { name: 'Áo thun trắng size M', price: 150000, stock: 5 })
    await makeProduct(shop.id, { name: 'Áo thun đen', price: 170000, stock: 3 })
    await makeProduct(other.id, { name: 'Áo thun shop khác', price: 999999 }) // must not leak

    const result = await searchProducts.run({ query: 'áo thun', limit: 5 }, ctxFor(shop.id, 'psid-x'))

    assert.equal(result.items.length, 2)
    const names = result.items.map((item) => item.name).sort()
    assert.deepEqual(names, ['Áo thun trắng size M', 'Áo thun đen'])
    assert.ok(result.items.every((item) => item.priceText.includes('₫')))
  } finally {
    await dropShops(shop.id, other.id)
  }
})

test('search_products: không khớp gì thì nói rõ, không bịa', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  try {
    const result = await searchProducts.run({ query: 'tủ lạnh', limit: 5 }, ctxFor(shop.id, 'psid-x'))
    assert.deepEqual(result.items, [])
    assert.match(result.note, /không có sản phẩm/i)
  } finally {
    await dropShops(shop.id)
  }
})

test('search_products: sản phẩm đã ngừng bán không xuất hiện', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  try {
    await makeProduct(shop.id, { name: 'Hàng cũ', isActive: false })
    const result = await searchProducts.run({ query: 'Hàng', limit: 5 }, ctxFor(shop.id, 'psid-x'))
    assert.deepEqual(result.items, [])
  } finally {
    await dropShops(shop.id)
  }
})

// ---------------------------------------------------------------- get_customer_profile

test('get_customer_profile: đọc đúng khách theo psid, không lẫn khách khác', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  try {
    await makeCustomer(shop.id, 'psid-a', { name: 'Nguyễn Thu Hà', phone: '0901234567', address: '1 Lê Lợi' })
    await makeCustomer(shop.id, 'psid-b', { name: 'Trần Minh Anh' })

    const a = await getCustomerProfile.run({}, ctxFor(shop.id, 'psid-a'))
    assert.deepEqual(a, { name: 'Nguyễn Thu Hà', phone: '0901234567', address: '1 Lê Lợi' })

    const b = await getCustomerProfile.run({}, ctxFor(shop.id, 'psid-b'))
    assert.equal(b.name, 'Trần Minh Anh')
    assert.equal(b.phone, null)
  } finally {
    await dropShops(shop.id)
  }
})

// ---------------------------------------------------------------- create_order

test('create_order: giá và tổng tính từ DB, model không truyền tiền được', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  const psid = `psid-${Date.now()}`
  try {
    const product = await makeProduct(shop.id, { name: 'Áo thun trắng', price: 150000, cost: 80000, stock: 10 })
    await makeCustomer(shop.id, psid)

    const result = await createOrder.run(
      { items: [{ productId: product.id, quantity: 2 }], name: 'Nguyễn Thu Hà', phone: '0901234567', address: '1 Lê Lợi, Quận 1' },
      ctxFor(shop.id, psid),
    )

    // 2 × 150.000 + 30.000 ship, all server-side.
    assert.equal(result.subtotal, 300000)
    assert.equal(result.shippingFee, tools.SHIPPING_FEE)
    assert.equal(result.total, 330000)
    assert.match(result.totalText, /330\.000/)
    assert.match(result.paymentCode, /^DH[2-9A-HJ-NP-Z]{8}$/)
    assert.ok(result.expiresAt, 'đơn phải có hạn thanh toán')
    assert.match(result.qrUrl, /img\.vietqr\.io/)
    assert.equal(result.transferNote, result.paymentCode)
  } finally {
    await dropShops(shop.id)
  }
})

test('create_order: schema KHÔNG có trường tiền nào', () => {
  // If the model could pass an amount, a prompt injection could sell a 500.000₫ item for 1.000₫.
  const shape = tools.createOrder.schema.safeParse({
    items: [{ productId: '00000000-0000-4000-8000-000000000000', quantity: 1, price: 1000 }],
    name: 'A', phone: '0901234567', address: '1 Lê Lợi',
  })
  assert.equal(shape.success, false, 'trường lạ (price) phải bị từ chối')

  const ok = tools.createOrder.schema.safeParse({
    items: [{ productId: '00000000-0000-4000-8000-000000000000', quantity: 1 }],
    name: 'A', phone: '0901234567', address: '1 Lê Lợi',
  })
  assert.equal(ok.success, true)
})

test('create_order: vượt tồn kho thì báo lỗi, không tạo đơn', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  const psid = `psid-${Date.now()}`
  try {
    const product = await makeProduct(shop.id, { name: 'Áo hiếm', stock: 2 })
    await makeCustomer(shop.id, psid)

    await assert.rejects(
      () => createOrder.run(
        { items: [{ productId: product.id, quantity: 5 }], name: 'A', phone: '0901234567', address: '1 Lê Lợi' },
        ctxFor(shop.id, psid),
      ),
      /chỉ còn 2/,
    )

    const { rows } = await pool.query('SELECT count(*)::int AS n FROM orders WHERE shop_id = $1', [shop.id])
    assert.equal(rows[0].n, 0, 'không có đơn nào được tạo')
  } finally {
    await dropShops(shop.id)
  }
})

test('create_order: sản phẩm của shop khác bị từ chối', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  const other = await makeShop()
  const psid = `psid-${Date.now()}`
  try {
    const foreign = await makeProduct(other.id, { name: 'Hàng shop khác' })
    await makeCustomer(shop.id, psid)

    await assert.rejects(
      () => createOrder.run(
        { items: [{ productId: foreign.id, quantity: 1 }], name: 'A', phone: '0901234567', address: '1 Lê Lợi' },
        ctxFor(shop.id, psid),
      ),
      /không còn bán/,
    )
  } finally {
    await dropShops(shop.id, other.id)
  }
})

test('create_order: lưu hồ sơ khách sau khi đặt hàng', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  const psid = `psid-${Date.now()}`
  try {
    const product = await makeProduct(shop.id)
    await makeCustomer(shop.id, psid)

    await createOrder.run(
      { items: [{ productId: product.id, quantity: 1 }], name: 'Lê Hoài An', phone: '0912345678', address: '2 Nguyễn Trãi' },
      ctxFor(shop.id, psid),
    )

    const saved = await customerRepo.findByPsid(shop.id, psid)
    assert.equal(saved.name, 'Lê Hoài An')
    assert.equal(saved.phone, '0912345678')
    assert.equal(saved.address, '2 Nguyễn Trãi')
  } finally {
    await dropShops(shop.id)
  }
})

// ---------------------------------------------------------------- check_payment_status

test('check_payment_status: trả trạng thái thật, nhắc chưa được xác nhận', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  const psid = `psid-${Date.now()}`
  try {
    const product = await makeProduct(shop.id)
    await makeCustomer(shop.id, psid)
    const created = await createOrder.run(
      { items: [{ productId: product.id, quantity: 1 }], name: 'A', phone: '0901234567', address: '1 Lê Lợi' },
      ctxFor(shop.id, psid),
    )

    const result = await checkPaymentStatus.run({ paymentCode: created.paymentCode }, ctxFor(shop.id, psid))
    assert.equal(result.status, 'AWAITING_PAYMENT')
    assert.match(result.note, /chờ ngân hàng xác nhận/)

    // Mark it paid the way the webhook would, then the tool must report PAID.
    await pool.query("UPDATE orders SET status = 'PAID', paid_at = now() WHERE id = $1", [created.orderId])
    const paid = await checkPaymentStatus.run({ paymentCode: created.paymentCode }, ctxFor(shop.id, psid))
    assert.equal(paid.status, 'PAID')
    assert.match(paid.note, /ngân hàng xác nhận thanh toán/)
  } finally {
    await dropShops(shop.id)
  }
})

test('check_payment_status: mã sai thì không lộ đơn, không bịa trạng thái', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  try {
    const result = await checkPaymentStatus.run({ paymentCode: 'DHKHONGCO' }, ctxFor(shop.id, 'psid-x'))
    assert.equal(result.status, null)
    assert.match(result.note, /Không tìm thấy đơn/)
  } finally {
    await dropShops(shop.id)
  }
})

test('check_payment_status: mã của shop khác không đọc được', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  const other = await makeShop()
  const psid = `psid-${Date.now()}`
  try {
    const product = await makeProduct(other.id)
    await makeCustomer(other.id, psid)
    const foreign = await createOrder.run(
      { items: [{ productId: product.id, quantity: 1 }], name: 'A', phone: '0901234567', address: '1 Lê Lợi' },
      ctxFor(other.id, psid),
    )

    const result = await checkPaymentStatus.run({ paymentCode: foreign.paymentCode }, ctxFor(shop.id, 'psid-x'))
    assert.equal(result.status, null, 'không được thấy đơn của shop khác')
  } finally {
    await dropShops(shop.id, other.id)
  }
})

// ---------------------------------------------------------------- handover_to_human

test('handover_to_human: đặt ai_paused để bot thôi trả lời', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  const psid = `psid-${Date.now()}`
  try {
    const customer = await makeCustomer(shop.id, psid)
    const conversation = await conversationRepo.ensureForCustomer(shop.id, customer.id)

    const result = await handoverToHuman.run({ reason: 'Khách đòi hoàn tiền' }, ctxFor(shop.id, psid, conversation.id))
    assert.equal(result.ok, true)

    const after = await conversationRepo.findByCustomer(shop.id, customer.id)
    assert.equal(after.ai_paused, true, 'bot phải dừng trả lời hội thoại này')
  } finally {
    await dropShops(shop.id)
  }
})

test('handover_to_human: reason quá ngắn bị schema từ chối', () => {
  const result = tools.handoverToHuman.schema.safeParse({ reason: 'x' })
  assert.equal(result.success, false)
})

// ---------------------------------------------------------------- tool set

test('bộ tool: đủ 5 công cụ, tên không trùng, đều có schema', () => {
  assert.equal(tools.botTools.length, 5)
  const names = tools.botTools.map((tool) => tool.name)
  assert.deepEqual(names.sort(), [
    'check_payment_status', 'create_order', 'get_customer_profile', 'handover_to_human', 'search_products',
  ])
  assert.ok(tools.botTools.every((tool) => tool.schema && typeof tool.run === 'function'))
})
