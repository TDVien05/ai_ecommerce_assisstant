// Messenger → DB. Live path (webhook), plus the history service's date/role helpers.
// The Graph API itself is not called here: no Page token, no network in tests.
process.env.NODE_ENV = 'test'
process.env.LOG_LEVEL = 'fatal'
process.env.JWT_SECRET = 'test-secret-only'

import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const { createShop, dropShops, dbAvailable, pool } = await import('../test-support/db.js')
const webhook = await import('../src/services/webhook/webhook.service.js')
const messenger = await import('../src/services/messenger/messenger.service.js')

after(async () => { await pool.end() })

const pageId = `page-messenger-${Date.now()}`

async function seedShop() {
  return createShop(`messenger-${Date.now()}-${Math.random()}`, { fb_page_id: pageId })
}

const payload = ({ psid = 'psid-1', mid = `m-${Date.now()}`, text = 'Áo còn size M không?' } = {}) => ({
  object: 'page',
  entry: [{
    id: pageId,
    time: Date.now(),
    messaging: [{
      sender: { id: psid },
      recipient: { id: pageId },
      timestamp: Date.now(),
      message: { mid, text },
    }],
  }],
})

async function messages(shopId) {
  const { rows } = await pool.query(
    `SELECT m.mid, m.role, m.content FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
      WHERE c.shop_id = $1 ORDER BY m.created_at, m.id`,
    [shopId],
  )
  return rows
}

beforeEach(() => webhook.resetHandlers())

test('messenger.message: lưu tin của khách vào customers, conversations, messages', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await seedShop()
  messenger.registerMessengerHandlers()
  try {
    const event = payload({ psid: 'psid-new', mid: `m-${Date.now()}`, text: 'Shop ơi còn hàng không?' })
    const result = await webhook.ingest({
      provider: 'messenger',
      externalId: event.entry[0].messaging[0].message.mid,
      type: 'messenger.message',
      payload: event,
    })

    assert.equal(result.processed, true)
    assert.deepEqual(await messages(shop.id), [
      { mid: event.entry[0].messaging[0].message.mid, role: 'user', content: 'Shop ơi còn hàng không?' },
    ])

    const { rows } = await pool.query('SELECT psid FROM customers WHERE shop_id = $1', [shop.id])
    assert.deepEqual(rows, [{ psid: 'psid-new' }])
  } finally {
    await dropShops(shop.id)
  }
})

test('messenger.message: cùng mid hai lần chỉ lưu một tin', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await seedShop()
  messenger.registerMessengerHandlers()
  try {
    const mid = `m-${Date.now()}`
    const event = payload({ psid: 'psid-dup', mid })

    await webhook.ingest({ provider: 'messenger', externalId: mid, type: 'messenger.message', payload: event })
    await webhook.ingest({ provider: 'sim', externalId: mid, type: 'messenger.message', payload: event })

    assert.equal((await messages(shop.id)).length, 1)
    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM conversations WHERE shop_id = $1', [shop.id])
    assert.equal(rows[0].n, 1, 'một khách chỉ có một hội thoại')
  } finally {
    await dropShops(shop.id)
  }
})

test('messenger.postback: lưu tiêu đề nút khách bấm như một tin của khách', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await seedShop()
  messenger.registerMessengerHandlers()
  try {
    // Meta sends no mid for postbacks, so the controller uses `<psid>:<timestamp>`.
    // The timestamp must be unique per run: (provider, external_id) is the dedupe key.
    const stamp = Date.now()
    const event = {
      object: 'page',
      entry: [{
        id: pageId,
        time: stamp,
        messaging: [{
          sender: { id: `psid-postback-${stamp}` },
          recipient: { id: pageId },
          timestamp: stamp,
          postback: { title: 'Xem đơn', payload: 'VIEW_ORDER' },
        }],
      }],
    }
    const externalId = `psid-postback-${stamp}:${stamp}`

    await webhook.ingest({ provider: 'messenger', externalId, type: 'messenger.postback', payload: event })

    assert.deepEqual(await messages(shop.id), [
      { mid: externalId, role: 'user', content: 'Xem đơn' },
    ])
  } finally {
    await dropShops(shop.id)
  }
})

test('tin có tệp đính kèm: vẫn lưu một dòng để hội thoại không rỗng', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await seedShop()
  messenger.registerMessengerHandlers()
  try {
    const mid = `m-${Date.now()}-file`
    const event = {
      object: 'page',
      entry: [{
        id: pageId,
        time: Date.now(),
        messaging: [{
          sender: { id: 'psid-file' },
          recipient: { id: pageId },
          timestamp: Date.now(),
          message: { mid, attachments: [{ type: 'image', payload: { url: 'https://cdn.example/a.jpg' } }] },
        }],
      }],
    }

    await webhook.ingest({ provider: 'messenger', externalId: mid, type: 'messenger.message', payload: event })

    const rows = await messages(shop.id)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].role, 'user')
    assert.match(rows[0].content, /https:\/\/cdn\.example\/a\.jpg/)
  } finally {
    await dropShops(shop.id)
  }
})

test('shop không xác định: sự kiện được xử lý nhưng không ghi vào shop nào', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await seedShop()
  messenger.registerMessengerHandlers()
  try {
    const mid = `m-${Date.now()}-unknown`
    const event = payload({ psid: 'psid-x', mid })
    event.entry[0].id = 'page-khong-ton-tai'

    const result = await webhook.ingest({ provider: 'messenger', externalId: mid, type: 'messenger.message', payload: event })

    assert.equal(result.processed, true)
    assert.deepEqual(await messages(shop.id), [], 'không được ghi vào shop khác')
  } finally {
    await dropShops(shop.id)
  }
})

test('tiền xử lý: text lấy từ message, postback và tệp đính kèm', () => {
  assert.equal(
    messenger.messageText({ message: { text: '  Xin chào  ' } }),
    'Xin chào',
  )
  assert.equal(
    messenger.messageText({ message: { attachments: [{ type: 'image', payload: { url: 'u' } }] } }),
    '[image] u',
  )
  assert.equal(messenger.messageText({ message: {} }), null)
  assert.equal(messenger.postbackText({ postback: { title: 'Xem đơn', payload: 'VIEW_ORDER' } }), 'Xem đơn')
  assert.equal(messenger.postbackText({ postback: { payload: 'VIEW_ORDER' } }), '[postback] VIEW_ORDER')
  assert.equal(messenger.postbackText({}), null)
})
