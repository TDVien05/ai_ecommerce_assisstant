// Send API: dựng đúng body, lưu tin của bot, chống trùng, lỗi 24h.
// Meta Ở ĐÂY được mock qua globalThis.fetch nên test không cần Page token thật, không gọi mạng.
process.env.NODE_ENV = 'test'
process.env.LOG_LEVEL = 'fatal'
process.env.JWT_SECRET = 'test-secret-only'
process.env.FB_PAGE_ACCESS_TOKEN = 'env-page-token'
process.env.GRAPH_API_VERSION = 'v23.0'

import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const { createShop, dropShops, dbAvailable, pool } = await import('../test-support/db.js')
const send = await import('../src/services/messenger/send.service.js')
const messageRepo = await import('../src/repositories/messenger/message.repository.js')
const customerRepo = await import('../src/repositories/messenger/customer.repository.js')
const conversationRepo = await import('../src/repositories/messenger/conversation.repository.js')

after(async () => { await pool.end() })

/** Replaces global fetch for one test; records every call. */
function mockFetch(handler) {
  const calls = []
  const original = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    const call = { url: String(url), init, body: init?.body ? JSON.parse(init.body) : null }
    calls.push(call)
    const result = await handler(call)
    return {
      ok: result.ok ?? true,
      status: result.status ?? 200,
      json: async () => result.body ?? { message_id: 'mid.default' },
    }
  }
  return { calls, restore: () => { globalThis.fetch = original } }
}

let shopId
beforeEach(async () => {
  // Each test gets its own shop so the "already answered" check cannot leak between tests.
  shopId = null
})

async function makeShop(extra = {}) {
  const shop = await createShop(`send-${Date.now()}-${Math.random()}`, extra)
  shopId = shop.id
  return shop
}

async function rows(conversationId) {
  const { rows: list } = await pool.query(
    `SELECT m.mid, m.role, m.content FROM messages m
      WHERE m.conversation_id = $1 ORDER BY m.created_at, m.id`,
    [conversationId],
  )
  return list
}

async function conversationOf(id) {
  const customer = await customerRepo.upsertByPsid(id, { psid: `psid-${Date.now()}-${Math.random()}` })
  return conversationRepo.ensureForCustomer(id, customer.id)
}

test('sendText: dựng đúng body Meta (recipient, messaging_type, text)', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  const mock = mockFetch(() => ({ body: { message_id: 'm_123', recipient_id: 'psid-1' } }))
  try {
    const result = await send.replyText({ shopId: shop.id, psid: 'psid-1', text: 'Chào bạn' })

    assert.equal(mock.calls.length, 1)
    const { url, body } = mock.calls[0]
    assert.match(url, /\/v23\.0\/me\/messages/)
    assert.match(url, /access_token=/) // token đi qua query string, không lộ trong body
    assert.deepEqual(body, {
      recipient: { id: 'psid-1' },
      messaging_type: 'RESPONSE',
      message: { text: 'Chào bạn' },
    })
    assert.equal(result.messageId, 'm_123')
    assert.equal(result.saved, true)
  } finally {
    mock.restore()
    await dropShops(shop.id)
  }
})

test('sendText: lưu tin của bot với role assistant và mid của Meta', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  const psid = `psid-save-${Date.now()}`
  // The same psid the send call uses, so both land in one conversation.
  const customer = await customerRepo.upsertByPsid(shop.id, { psid })
  const conversation = await conversationRepo.ensureForCustomer(shop.id, customer.id)
  const mock = mockFetch(() => ({ body: { message_id: 'm_bot_1' } }))
  try {
    await send.replyText({ shopId: shop.id, psid, text: 'Dạ còn hàng' })

    const list = await rows(conversation.id)
    assert.deepEqual(list, [{ mid: 'm_bot_1', role: 'assistant', content: 'Dạ còn hàng' }])
  } finally {
    mock.restore()
    await dropShops(shop.id)
  }
})

test('gửi lỗi: KHÔNG lưu tin, ném lỗi rõ ràng', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  const psid = `psid-err-${Date.now()}`
  const customer = await customerRepo.upsertByPsid(shop.id, { psid })
  const conversation = await conversationRepo.ensureForCustomer(shop.id, customer.id)
  const mock = mockFetch(() => ({ ok: false, status: 400, body: { error: { code: 100, message: 'Invalid parameter' } } }))
  try {
    await assert.rejects(
      () => send.replyText({ shopId: shop.id, psid, text: 'x' }),
      /Meta từ chối tin nhắn/,
    )
    assert.deepEqual(await rows(conversation.id), [], 'không có dòng rác nào được ghi')
  } finally {
    mock.restore()
    await dropShops(shop.id)
  }
})

test('lỗi cửa sổ 24h: mã lỗi riêng, thông báo tiếng Việt', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  const mock = mockFetch(() => ({ ok: false, status: 400, body: { error: { code: 10, error_subcode: 2018278, message: 'outside window' } } }))
  try {
    await assert.rejects(
      () => send.replyText({ shopId: shop.id, psid: 'psid-win', text: 'x' }),
      (error) => {
        assert.equal(error.code, 'MESSENGER_WINDOW_CLOSED')
        assert.match(error.message, /24 giờ/)
        return true
      },
    )
  } finally {
    mock.restore()
    await dropShops(shop.id)
  }
})

test('token theo shop: dùng fb_page_token của shop trước, fallback env', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const withToken = await createShop(`send-own-${Date.now()}-${Math.random()}`, { fb_page_token: 'shop-own-token' })
  const noToken = await createShop(`send-env-${Date.now()}-${Math.random()}`)
  const mock = mockFetch(() => ({ body: { message_id: 'm_t' } }))
  try {
    // A shop with its own Page token must use that one.
    await send.replyText({ shopId: withToken.id, psid: 'psid-t', text: 'x' })
    assert.match(mock.calls[0].url, /access_token=shop-own-token/)

    // A shop without its own token falls back to the deployment token.
    await send.replyText({ shopId: noToken.id, psid: 'psid-t2', text: 'x' })
    assert.match(mock.calls[mock.calls.length - 1].url, /access_token=env-page-token/)
  } finally {
    mock.restore()
    await dropShops(withToken.id, noToken.id)
  }
})

test('chống trùng: đã trả lời cho mid này rồi thì không gửi lần hai', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  const psid = `psid-dup-${Date.now()}`
  const inboundMid = `m-in-${Date.now()}`

  // The customer's message, then a bot reply, in the real order.
  const customer = await customerRepo.upsertByPsid(shop.id, { psid })
  const conversation = await conversationRepo.ensureForCustomer(shop.id, customer.id)
  await messageRepo.create(shop.id, { conversationId: conversation.id, mid: inboundMid, role: 'user', content: 'Còn hàng không?' })

  const mock = mockFetch(() => ({ body: { message_id: 'm_reply_1' } }))
  try {
    const first = await send.replyText({ shopId: shop.id, psid, text: 'Dạ còn', inboundMid })
    assert.equal(first.skipped, false)
    assert.equal(mock.calls.length, 1)

    // A retried webhook runs the same reply again: it must be skipped, not sent twice.
    const second = await send.replyText({ shopId: shop.id, psid, text: 'Dạ còn', inboundMid })
    assert.equal(second.skipped, true)
    assert.equal(mock.calls.length, 1, 'không gọi Meta lần hai')

    const list = await rows(conversation.id)
    assert.equal(list.filter((row) => row.role === 'assistant').length, 1)
  } finally {
    mock.restore()
    await dropShops(shop.id)
  }
})

test('sendImage: dựng đúng attachment, lưu cả ảnh và chú thích', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  const psid = `psid-img-${Date.now()}`
  const customer = await customerRepo.upsertByPsid(shop.id, { psid })
  const conversation = await conversationRepo.ensureForCustomer(shop.id, customer.id)
  const mock = mockFetch((call) => ({
    body: { message_id: call.body.message.attachment ? 'm_img' : 'm_cap' },
  }))
  try {
    const url = 'https://img.vietqr.io/image/MB-123-compact2.png?amount=1000&addInfo=DHABC'
    await send.replyImage({ shopId: shop.id, psid, url, caption: 'Quét mã để chuyển khoản' })

    assert.equal(mock.calls.length, 2, 'một lần gửi ảnh, một lần gửi chú thích')
    assert.deepEqual(mock.calls[0].body.message.attachment, {
      type: 'image',
      payload: { url, is_reusable: true },
    })
    assert.equal(mock.calls[1].body.message.text, 'Quét mã để chuyển khoản')

    const list = await rows(conversation.id)
    assert.equal(list.length, 2)
    assert.equal(list[0].content, `[image] ${url}`)
    assert.equal(list[1].content, 'Quét mã để chuyển khoản')
  } finally {
    mock.restore()
    await dropShops(shop.id)
  }
})

test('sendQuickReplies: cắt tiêu đề 20 ký tự và tối đa 13 nút', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  const mock = mockFetch(() => ({ body: { message_id: 'm_qr' } }))
  try {
    const replies = Array.from({ length: 15 }, (_, index) => ({
      title: `Nút số ${index} với tiêu đề rất dài`,
      payload: `PAYLOAD_${index}`,
    }))
    await send.replyQuickReplies({ shopId: shop.id, psid: 'psid-qr', text: 'Bạn chọn giúp mình', replies })

    const quick = mock.calls[0].body.message.quick_replies
    assert.equal(quick.length, 13)
    assert.ok(quick.every((item) => item.title.length <= 20))
    // Meta caps a quick-reply title at 20 characters; we cut instead of letting Meta reject it.
    assert.equal(quick[0].title.length, 20)
    assert.equal(quick[0].payload, 'PAYLOAD_0')
    assert.equal(quick[0].content_type, 'text')
  } finally {
    mock.restore()
    await dropShops(shop.id)
  }
})

test('thiếu token hoàn toàn: báo MESSENGER_NOT_CONFIGURED', () => {
  // `env` is frozen at import time, so the fallback rule is tested through the pure helper
  // instead of mutating process.env mid-run.
  assert.equal(send.resolveToken('shop-token', 'env-token'), 'shop-token', 'token của shop thắng')
  assert.equal(send.resolveToken(null, 'env-token'), 'env-token', 'fallback về token triển khai')
  assert.throws(
    () => send.resolveToken(null, undefined),
    (error) => {
      assert.equal(error.code, 'MESSENGER_NOT_CONFIGURED')
      assert.match(error.message, /Page access token/)
      return true
    },
  )
})

test('timeout mạng: ném MESSENGER_API_FAILED, không lưu DB', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  const psid = `psid-net-${Date.now()}`
  const customer = await customerRepo.upsertByPsid(shop.id, { psid })
  const conversation = await conversationRepo.ensureForCustomer(shop.id, customer.id)
  const original = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('network down') }
  try {
    await assert.rejects(
      () => send.replyText({ shopId: shop.id, psid, text: 'x' }),
      (error) => {
        assert.equal(error.code, 'MESSENGER_API_FAILED')
        return true
      },
    )
    assert.deepEqual(await rows(conversation.id), [])
  } finally {
    globalThis.fetch = original
    await dropShops(shop.id)
  }
})
