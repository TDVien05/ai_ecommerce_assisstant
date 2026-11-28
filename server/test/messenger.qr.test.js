// Bước 5: gửi ảnh VietQR trong chat sau khi tạo đơn.
// Send API bị thay bằng fetch giả; AI bị inject để trả về đúng tool call cần thiết.
process.env.NODE_ENV = 'test'
process.env.LOG_LEVEL = 'fatal'
process.env.JWT_SECRET = 'test-secret-only'
process.env.FB_PAGE_ACCESS_TOKEN = 'env-page-token'

import { test, after } from 'node:test'
import assert from 'node:assert/strict'

const { createShop, dropShops, dbAvailable, pool } = await import('../test-support/db.js')
const bot = await import('../src/services/messenger/bot.service.js')
const customerRepo = await import('../src/repositories/messenger/customer.repository.js')
const conversationRepo = await import('../src/repositories/messenger/conversation.repository.js')
const messageRepo = await import('../src/repositories/messenger/message.repository.js')

after(async () => { await pool.end() })

/** Capture Send API calls instead of reaching Meta. */
function mockSend() {
  const calls = []
  const original = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : null
    calls.push({ url: String(url), body })
    const isImage = Boolean(body?.message?.attachment)
    return { ok: true, status: 200, json: async () => ({ message_id: isImage ? 'm_img' : 'm_text' }) }
  }
  return { calls, restore: () => { globalThis.fetch = original } }
}

async function makeShop() {
  return createShop(`qr-${Date.now()}-${Math.random()}`)
}

async function seed(shopId, psid) {
  const customer = await customerRepo.upsertByPsid(shopId, { psid })
  const conversation = await conversationRepo.ensureForCustomer(shopId, customer.id)
  const mid = `m-in-${Date.now()}-${Math.random()}`
  await messageRepo.create(shopId, { conversationId: conversation.id, mid, role: 'user', content: 'Chốt đơn giúp mình' })
  return { conversation, mid }
}

/** An AI stub that "creates an order", then answers in text. */
const aiThatCreatesOrder = (overrides = {}) => async ({ ctx }) => ({
  text: 'Mình đã gửi mã QR, bạn quét để chuyển 330.000 ₫ nhé.',
  toolCalls: [{
    name: 'create_order',
    ok: true,
    input: {},
    output: {
      orderId: 'order-1',
      paymentCode: 'DH8F3K2AB',
      total: 330000,
      totalText: '330.000 ₫',
      qrUrl: 'https://img.vietqr.io/image/MB-123-compact2.png?amount=330000&addInfo=DH8F3K2AB',
      paymentReady: true,
      ...overrides,
    },
  }],
})

test('qrFromToolCalls: chỉ lấy create_order thành công và có QR', () => {
  assert.equal(bot.qrFromToolCalls([]), null)
  assert.equal(bot.qrFromToolCalls([{ name: 'search_products', ok: true, output: {} }]), null)

  // A failed create_order carries an error, not an order.
  assert.equal(
    bot.qrFromToolCalls([{ name: 'create_order', ok: false, output: { error: 'hết hàng' } }]),
    null,
  )

  // No receiving account: no image to send.
  assert.equal(
    bot.qrFromToolCalls([{
      name: 'create_order', ok: true,
      output: { paymentCode: 'DHX', qrUrl: null, paymentReady: false },
    }]),
    null,
  )

  const found = bot.qrFromToolCalls([{
    name: 'create_order', ok: true,
    output: { paymentCode: 'DH8F3K2AB', qrUrl: 'https://x/y.png', totalText: '330.000 ₫', paymentReady: true },
  }])
  assert.equal(found.paymentCode, 'DH8F3K2AB')
  assert.equal(found.qrUrl, 'https://x/y.png')
})

test('tạo đơn xong: gửi text rồi gửi ảnh QR kèm chú thích', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  const psid = `psid-${Date.now()}`
  const send = mockSend()
  try {
    const { conversation, mid } = await seed(shop.id, psid)

    const result = await bot.answerCustomer({
      shopId: shop.id, psid, conversationId: conversation.id, inboundMid: mid,
      runAi: aiThatCreatesOrder(),
    })

    assert.equal(result.replied, true)
    assert.equal(result.qrSent, true)
    // One text reply, then replyImage sends TWO calls: the image, then its caption.
    assert.equal(send.calls.length, 3, 'một text + một ảnh + một chú thích')

    // Text first so the explanation reads before the image.
    assert.match(send.calls[0].body.message.text, /QR/)

    const image = send.calls[1].body.message.attachment
    assert.equal(image.type, 'image')
    assert.match(image.payload.url, /img\.vietqr\.io/)
    assert.match(image.payload.url, /addInfo=DH8F3K2AB/)

    // The caption carries the code and the amount, so the image alone is not ambiguous.
    assert.match(send.calls[2].body.message.text, /DH8F3K2AB/)
    assert.match(send.calls[2].body.message.text, /330\.000/)
  } finally {
    send.restore()
    await dropShops(shop.id)
  }
})

test('ảnh QR không bị chặn bởi bộ chống trùng của tin text', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  const psid = `psid-${Date.now()}`
  const send = mockSend()
  try {
    const { conversation, mid } = await seed(shop.id, psid)

    await bot.answerCustomer({
      shopId: shop.id, psid, conversationId: conversation.id, inboundMid: mid,
      runAi: aiThatCreatesOrder(),
    })

    // The text reply is now the last message. If replyImage had passed `inboundMid`, the dedupe
    // check would see "the bot already answered" and silently drop the image.
    assert.equal(send.calls.filter((call) => call.body.message.attachment).length, 1)

    const { rows } = await pool.query(
      `SELECT m.role, m.content FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
        WHERE c.shop_id = $1 ORDER BY m.created_at, m.id`,
      [shop.id],
    )
    const contents = rows.map((row) => row.content)
    assert.equal(contents.filter((item) => String(item).startsWith('[image]')).length, 1)
  } finally {
    send.restore()
    await dropShops(shop.id)
  }
})

test('không tạo đơn thì không gửi ảnh', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  const psid = `psid-${Date.now()}`
  const send = mockSend()
  try {
    const { conversation, mid } = await seed(shop.id, psid)

    const result = await bot.answerCustomer({
      shopId: shop.id, psid, conversationId: conversation.id, inboundMid: mid,
      runAi: async () => ({ text: 'Dạ còn hàng ạ.', toolCalls: [] }),
    })

    assert.equal(result.replied, true)
    assert.equal(result.qrSent, false)
    assert.equal(send.calls.length, 1, 'chỉ một tin text')
  } finally {
    send.restore()
    await dropShops(shop.id)
  }
})

test('shop chưa có tài khoản nhận tiền: không gửi ảnh hỏng', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  const psid = `psid-${Date.now()}`
  const send = mockSend()
  try {
    const { conversation, mid } = await seed(shop.id, psid)

    const result = await bot.answerCustomer({
      shopId: shop.id, psid, conversationId: conversation.id, inboundMid: mid,
      runAi: aiThatCreatesOrder({ qrUrl: null, paymentReady: false }),
    })

    assert.equal(result.replied, true)
    assert.equal(result.qrSent, false)
    assert.equal(send.calls.length, 1, 'chỉ gửi text')
  } finally {
    send.restore()
    await dropShops(shop.id)
  }
})

test('gửi ảnh lỗi: đơn vẫn thành công, không ném ra ngoài', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  const psid = `psid-${Date.now()}`
  const original = globalThis.fetch
  let call = 0
  globalThis.fetch = async (_url, init) => {
    call += 1
    const isImage = Boolean(JSON.parse(init.body)?.message?.attachment)
    if (isImage) throw new Error('upload failed')
    return { ok: true, status: 200, json: async () => ({ message_id: 'm_text' }) }
  }
  try {
    const { conversation, mid } = await seed(shop.id, psid)

    const result = await bot.answerCustomer({
      shopId: shop.id, psid, conversationId: conversation.id, inboundMid: mid,
      runAi: aiThatCreatesOrder(),
    })

    assert.equal(result.replied, true, 'text đã gửi thì lượt vẫn tính là thành công')
    assert.equal(result.qrSent, false)
    assert.equal(call, 2, 'đã thử gửi ảnh rồi thất bại')
  } finally {
    globalThis.fetch = original
    await dropShops(shop.id)
  }
})
