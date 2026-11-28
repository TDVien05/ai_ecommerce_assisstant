// Bước 2: cổng quyết định bot có được trả lời hay không (ai_paused + quota), và việc nối
// cổng đó vào handler nhận tin. Không gọi AI, không gọi Meta.
process.env.NODE_ENV = 'test'
process.env.LOG_LEVEL = 'fatal'
process.env.JWT_SECRET = 'test-secret-only'
process.env.FB_PAGE_ACCESS_TOKEN = 'env-page-token'
// Small limit so the quota test does not have to make 50 calls.
process.env.AI_DAILY_RUN_LIMIT = '3'

import { test, after } from 'node:test'
import assert from 'node:assert/strict'

const { createShop, dropShops, dbAvailable, pool } = await import('../test-support/db.js')
const gate = await import('../src/services/messenger/gate.service.js')
const messenger = await import('../src/services/messenger/messenger.service.js')
const customerRepo = await import('../src/repositories/messenger/customer.repository.js')
const conversationRepo = await import('../src/repositories/messenger/conversation.repository.js')
const webhook = await import('../src/services/webhook/webhook.service.js')

after(async () => { await pool.end() })

async function makeShop() {
  return createShop(`gate-${Date.now()}-${Math.random()}`)
}

const psidFor = () => `psid-${Date.now()}-${Math.random()}`

function eventFor(shop, psid, text = 'Còn hàng không?') {
  const mid = `m-${Date.now()}-${Math.random()}`
  return {
    mid,
    payload: {
      object: 'page',
      entry: [{
        id: shop.fb_page_id ?? 'page-x',
        time: Date.now(),
        messaging: [{ sender: { id: psid }, recipient: { id: 'page-x' }, timestamp: Date.now(), message: { mid, text } }],
      }],
    },
  }
}

test('cổng: hội thoại bình thường thì cho phép trả lời và có reservation', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  try {
    const result = await gate.checkBotReply(shop.id, psidFor())
    assert.equal(result.reply, true)
    assert.equal(result.reason, 'ok')
    assert.ok(result.conversationId)
    assert.ok(result.reservation, 'phải giữ một lượt để hoàn lại nếu AI lỗi')
    result.reservation.commit()
  } finally {
    await dropShops(shop.id)
  }
})

test('cổng: ai_paused = true thì KHÔNG trả lời, không giữ lượt', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  const psid = psidFor()
  try {
    // The shop owner has taken over this conversation.
    const first = await gate.checkBotReply(shop.id, psid)
    await gate.pauseConversation(shop.id, first.conversationId)

    const paused = await gate.checkBotReply(shop.id, psid)
    assert.equal(paused.reply, false)
    assert.equal(paused.reason, 'ai_paused')
    assert.equal(paused.reservation, null, 'không được tiêu lượt khi bot bị tắt')

    // Resuming lets the bot answer again.
    await gate.resumeConversation(shop.id, first.conversationId)
    const resumed = await gate.checkBotReply(shop.id, psid)
    assert.equal(resumed.reply, true)
    resumed.reservation.commit()
  } finally {
    await dropShops(shop.id)
  }
})

test('cổng: hết lượt trong ngày thì từ chối với lý do daily_limit', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  try {
    // AI_DAILY_RUN_LIMIT = 3 in this test file.
    for (let index = 0; index < 3; index += 1) {
      const result = await gate.checkBotReply(shop.id, psidFor())
      assert.equal(result.reply, true, `lượt ${index + 1} phải được phép`)
      result.reservation.commit()
    }

    const blocked = await gate.checkBotReply(shop.id, psidFor())
    assert.equal(blocked.reply, false)
    assert.equal(blocked.reason, 'daily_limit')
    assert.equal(blocked.reservation, null)
  } finally {
    await dropShops(shop.id)
  }
})

test('cổng: hoàn lại lượt thì không bị tính vào hạn mức', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  try {
    // Reserve and refund three times: the counter must go back to zero each time.
    for (let index = 0; index < 3; index += 1) {
      const result = await gate.checkBotReply(shop.id, psidFor())
      assert.equal(result.reply, true)
      result.reservation.refund()
    }
    const stillAllowed = await gate.checkBotReply(shop.id, psidFor())
    assert.equal(stillAllowed.reply, true, 'hoàn lượt xong vẫn còn hạn mức')
    stillAllowed.reservation.commit()
  } finally {
    await dropShops(shop.id)
  }
})

test('cổng: hạn mức tính riêng từng shop', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const a = await makeShop()
  const b = await makeShop()
  try {
    for (let index = 0; index < 3; index += 1) {
      const result = await gate.checkBotReply(a.id, psidFor())
      result.reservation.commit()
    }
    const blockedA = await gate.checkBotReply(a.id, psidFor())
    assert.equal(blockedA.reply, false, 'shop A đã hết lượt')

    const allowedB = await gate.checkBotReply(b.id, psidFor())
    assert.equal(allowedB.reply, true, 'shop B không bị ảnh hưởng')
    allowedB.reservation.commit()
  } finally {
    await dropShops(a.id, b.id)
  }
})

test('cổng: thiếu shop hoặc psid thì từ chối, không tạo dữ liệu', async () => {
  const result = await gate.checkBotReply(null, 'psid-x')
  assert.equal(result.reply, false)
  assert.equal(result.reason, 'missing_shop_or_psid')
})

test('nối vào handler: tin vẫn được lưu dù bot bị tắt', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  const psid = psidFor()
  try {
    // Pause the conversation first, as if the owner had taken over.
    const first = await gate.checkBotReply(shop.id, psid)
    await gate.pauseConversation(shop.id, first.conversationId)

    const { mid, payload } = eventFor(shop, psid, 'Shop ơi, tư vấn giúp mình')
    const result = await messenger.handleMessengerEvent({
      eventId: 1, shopId: shop.id, externalId: mid, payload,
    })

    assert.equal(result.saved !== null, true, 'tin của khách vẫn phải được lưu')
    assert.equal(result.gate.reply, false)
    assert.equal(result.gate.reason, 'ai_paused')

    const { rows } = await pool.query(
      `SELECT m.content FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
        WHERE c.shop_id = $1 AND m.mid = $2`,
      [shop.id, mid],
    )
    assert.equal(rows.length, 1, 'chủ shop vẫn đọc được tin khách gửi')
  } finally {
    await dropShops(shop.id)
  }
})

test('nối vào handler: bot bật thì gate cho phép, nhưng bước 2 chưa gửi tin nào', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await makeShop()
  const psid = psidFor()
  try {
    const { mid, payload } = eventFor(shop, psid)
    const result = await messenger.handleMessengerEvent({
      eventId: 2, shopId: shop.id, externalId: mid, payload,
    })

    assert.equal(result.gate.reply, true)
    assert.equal(result.gate.reason, 'ok')

    const { rows } = await pool.query(
      `SELECT m.role FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
        WHERE c.shop_id = $1`,
      [shop.id],
    )
    // Only the customer's message: step 3 (bot loop) is what will add an assistant row.
    assert.deepEqual(rows.map((row) => row.role), ['user'])
  } finally {
    await dropShops(shop.id)
  }
})

test('qua đường ống webhook: gate chạy và sự kiện vẫn PROCESSED', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const pageId = `page-gate-${Date.now()}`
  const shop = await createShop(`gate-pipe-${Date.now()}-${Math.random()}`, { fb_page_id: pageId })
  webhook.resetHandlers()
  messenger.registerMessengerHandlers()
  try {
    const psid = psidFor()
    const mid = `m-${Date.now()}`
    const payload = {
      object: 'page',
      entry: [{
        id: pageId,
        time: Date.now(),
        messaging: [{ sender: { id: psid }, recipient: { id: pageId }, timestamp: Date.now(), message: { mid, text: 'Xin chào' } }],
      }],
    }

    const result = await webhook.ingest({ provider: 'messenger', externalId: mid, type: 'messenger.message', payload })
    assert.equal(result.processed, true, 'cổng không được làm hỏng đường ống')

    const { rows } = await pool.query(
      `SELECT m.content FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.shop_id = $1`,
      [shop.id],
    )
    assert.deepEqual(rows, [{ content: 'Xin chào' }])
  } finally {
    webhook.resetHandlers()
    await dropShops(shop.id)
  }
})
