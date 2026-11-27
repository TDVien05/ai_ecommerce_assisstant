process.env.NODE_ENV = 'test'
process.env.LOG_LEVEL = 'fatal'
process.env.JWT_SECRET = 'test-secret-only'
process.env.SIM_WEBHOOK_SECRET = 'test-sim-secret'
process.env.FB_APP_SECRET = 'test-fb-secret'

import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

const { createShop, dropShops, dbAvailable, pool } = await import('../test-support/db.js')
const webhook = await import('../src/services/webhook.service.js')
const blocklist = await import('../src/db/repos/blocklist.js')
const payments = await import('../src/db/repos/payments.js')
const customers = await import('../src/db/repos/customers.js')
const orders = await import('../src/db/repos/orders.js')
const { createApp } = await import('../src/app.js')

after(async () => { await pool.end() })

const bank = '1017588888'
const pageId = `page-${Date.now()}`

async function seedShop(extra = {}) {
  return createShop(`webhook-${Date.now()}-${Math.random()}`, {
    bank_account_number: bank,
    bank_code: 'MB',
    fb_page_id: pageId,
    ...extra,
  })
}

const paymentPayload = (overrides = {}) => ({
  id: Date.now() + Math.floor(Math.random() * 1000),
  gateway: 'MB',
  accountNumber: bank,
  code: 'DHABC123',
  content: 'DHABC123 chuyen tien',
  transferType: 'in',
  transferAmount: 250000,
  referenceCode: `FT${Date.now()}`,
  ...overrides,
})

const messengerPayload = (psid = 'psid-1', mid = `m-${Date.now()}`) => ({
  object: 'page',
  entry: [{
    id: pageId,
    time: Date.now(),
    messaging: [{
      sender: { id: psid },
      recipient: { id: pageId },
      timestamp: Date.now(),
      message: { mid, text: 'Áo còn size M không?' },
    }],
  }],
})

let received
beforeEach(() => {
  received = []
  webhook.resetHandlers()
})

const handler = (type) => async (envelope) => { received.push({ type, ...envelope }) }

async function fraudRows(shopId) {
  const { rows } = await pool.query('SELECT level, rule FROM fraud_checks WHERE shop_id = $1 ORDER BY id', [shopId])
  return rows
}

async function eventRow(shopId, externalId) {
  const { rows } = await pool.query(
    'SELECT status FROM webhook_events WHERE shop_id = $1 AND external_id = $2',
    [shopId, externalId],
  )
  return rows[0] ?? null
}

test('ingest: sự kiện sạch được lưu, ghi fraud LOW và tới handler', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await seedShop()
  webhook.onEvent('payment.received', handler('payment.received'))
  try {
    const payload = paymentPayload()
    const result = await webhook.ingest({ provider: 'sim', externalId: String(payload.id), type: 'payment.received', payload })

    assert.equal(result.processed, true)
    assert.equal(result.duplicate, false)
    assert.equal(received.length, 1)
    assert.equal(received[0].shopId, shop.id)
    assert.deepEqual(await fraudRows(shop.id), [{ level: 'LOW', rule: 'passed' }])
    assert.equal((await eventRow(shop.id, String(payload.id))).status, 'PROCESSED')
  } finally {
    await dropShops(shop.id)
  }
})

test('ingest: cùng id hai lần thì lần hai là bản trùng, handler chỉ chạy một lần', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await seedShop()
  webhook.onEvent('payment.received', handler('payment.received'))
  try {
    const payload = paymentPayload()
    const input = { provider: 'sepay', externalId: String(payload.id), type: 'payment.received', payload }
    await webhook.ingest(input)
    const second = await webhook.ingest(input)

    assert.equal(second.duplicate, true)
    assert.equal(received.length, 1)
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM webhook_events WHERE shop_id = $1', [shop.id])
    assert.equal(rows[0].n, 1)
  } finally {
    await dropShops(shop.id)
  }
})

test('fraud: số tài khoản nhận không phải của shop → HIGH, chặn xử lý', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await seedShop()
  webhook.onEvent('payment.received', handler('payment.received'))
  try {
    // The shop is found through the payment code on the order, then the account is compared.
    const customer = await customers.create(shop.id, { psid: 'psid-wrong-account' })
    await orders.create(shop.id, {
      customerId: customer.id, paymentCode: 'DHWRONG01', subtotal: 250000, total: 250000,
    }, [])

    const payload = paymentPayload({ accountNumber: '9999999999', code: 'DHWRONG01', content: 'DHWRONG01 chuyen tien' })
    const result = await webhook.ingest({ provider: 'sim', externalId: String(payload.id), type: 'payment.received', payload })

    assert.equal(result.ignored, true)
    assert.equal(received.length, 0, 'handler không được chạy')
    assert.deepEqual(await fraudRows(shop.id), [{ level: 'HIGH', rule: 'wrong_receiving_account' }])
    assert.equal((await eventRow(shop.id, String(payload.id))).status, 'IGNORED')
  } finally {
    await dropShops(shop.id)
  }
})

test('fraud: giao dịch tiền ra → HIGH', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await seedShop()
  webhook.onEvent('payment.received', handler('payment.received'))
  try {
    const payload = paymentPayload({ transferType: 'out' })
    const result = await webhook.ingest({ provider: 'sepay', externalId: String(payload.id), type: 'payment.received', payload })
    assert.equal(result.ignored, true)
    assert.deepEqual(await fraudRows(shop.id), [{ level: 'HIGH', rule: 'outgoing_transfer' }])
  } finally {
    await dropShops(shop.id)
  }
})

test('fraud: khách nằm trong blocklist → HIGH', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await seedShop()
  webhook.onEvent('messenger.message', handler('messenger.message'))
  try {
    await blocklist.add(shop.id, { kind: 'PSID', value: 'psid-evil', reason: 'spam' })
    const payload = messengerPayload('psid-evil', `m-${Date.now()}`)
    const result = await webhook.ingest({ provider: 'messenger', externalId: payload.entry[0].messaging[0].message.mid, type: 'messenger.message', payload })

    assert.equal(result.ignored, true)
    assert.equal(received.length, 0)
    assert.deepEqual(await fraudRows(shop.id), [{ level: 'HIGH', rule: 'blocked_sender' }])
  } finally {
    await dropShops(shop.id)
  }
})

test('fraud: mã thanh toán đã đối soát trước đó → HIGH', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await seedShop()
  webhook.onEvent('payment.received', handler('payment.received'))
  try {
    const first = paymentPayload({ code: 'DHREUSE01' })
    await payments.insert(shop.id, {
      sepayId: Number(first.id), accountNumber: bank, code: 'DHREUSE01',
      transferType: 'in', transferAmount: 250000, matchStatus: 'MATCHED', raw: first,
    })

    const reused = paymentPayload({ code: 'DHREUSE01' })
    const result = await webhook.ingest({ provider: 'sim', externalId: String(reused.id), type: 'payment.received', payload: reused })

    assert.equal(result.ignored, true)
    assert.deepEqual(await fraudRows(shop.id), [{ level: 'HIGH', rule: 'reused_payment_code' }])
  } finally {
    await dropShops(shop.id)
  }
})

test('ingest: tin từ /webhooks/sim và từ Messenger cùng tới một handler', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await seedShop()
  webhook.onEvent('messenger.message', handler('messenger.message'))
  try {
    const messengerEvent = messengerPayload('psid-2', `m-${Date.now()}-a`)
    await webhook.ingest({
      provider: 'messenger',
      externalId: messengerEvent.entry[0].messaging[0].message.mid,
      type: 'messenger.message',
      payload: messengerEvent,
    })

    const simEvent = messengerPayload('psid-3', `m-${Date.now()}-b`)
    await webhook.ingest({
      provider: 'sim',
      externalId: simEvent.entry[0].messaging[0].message.mid,
      type: 'messenger.message',
      payload: simEvent,
    })

    assert.equal(received.length, 2)
    assert.deepEqual(received.map((r) => r.provider), ['messenger', 'sim'])
    assert.ok(received.every((r) => r.shopId === shop.id))
  } finally {
    await dropShops(shop.id)
  }
})

test('HTTP /webhooks/sim: sai chữ ký → 403 + fraud HIGH, không lưu sự kiện', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await seedShop()
  webhook.onEvent('payment.received', handler('payment.received'))

  const app = createApp()
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    const payload = paymentPayload()
    const bad = await fetch(`${base}/webhooks/sim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Sim-Signature': 'sha256=deadbeef' },
      body: JSON.stringify(payload),
    })
    assert.equal(bad.status, 403)
    assert.equal(received.length, 0)

    const { rows } = await pool.query(
      "SELECT level, rule FROM fraud_checks WHERE provider = 'sim' AND rule = 'invalid_signature' ORDER BY id DESC LIMIT 1",
    )
    assert.deepEqual(rows[0], { level: 'HIGH', rule: 'invalid_signature' })

    const raw = JSON.stringify(payload)
    const signature = 'sha256=' + crypto.createHmac('sha256', 'test-sim-secret').update(raw).digest('hex')
    const good = await fetch(`${base}/webhooks/sim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Sim-Signature': signature },
      body: raw,
    })
    assert.equal(good.status, 200)
    assert.equal((await good.json()).duplicate, false)
    // deferred processing: give setImmediate a tick
    await new Promise((resolve) => setTimeout(resolve, 300))
    assert.equal((await eventRow(shop.id, String(payload.id))).status, 'PROCESSED')
    assert.equal(received.length, 1)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    await dropShops(shop.id)
  }
})
