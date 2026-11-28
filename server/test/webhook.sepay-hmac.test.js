// SePay webhook authentication: HMAC-SHA256 (recommended) or API key.
// Contracts: https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc
process.env.NODE_ENV = 'test'
process.env.LOG_LEVEL = 'fatal'
process.env.JWT_SECRET = 'test-secret-only'
process.env.SEPAY_WEBHOOK_SECRET = 'test-sepay-secret'

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

const { createShop, dropShops, dbAvailable, pool } = await import('../test-support/db.js')
const { signPayload } = await import('../src/middlewares/verifySepaySignature.js')
const { createApp } = await import('../src/app.js')

after(async () => { await pool.end() })

const SECRET = 'test-sepay-secret'
const account = `20${String(Date.now()).slice(-7)}${Math.floor(Math.random() * 10)}`

async function seedShop() {
  return createShop(`sepay-${Date.now()}-${Math.random()}`, {
    bank_account_number: account,
    bank_code: 'MB',
  })
}

const payload = (overrides = {}) => ({
  id: Date.now() + Math.floor(Math.random() * 1000),
  gateway: 'MB',
  transactionDate: '2026-11-28 15:20:00',
  accountNumber: account,
  subAccount: '',
  code: 'DHABC123',
  content: 'DHABC123 chuyen tien',
  transferType: 'in',
  transferAmount: 250000,
  accumulated: 5000000,
  referenceCode: `FT${Date.now()}`,
  ...overrides,
})

/** Start the app on a random port; returns a fetch helper and a closer. */
async function withServer(run) {
  const server = createApp().listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    return await run(base)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

async function post(base, body, headers) {
  const raw = JSON.stringify(body)
  const res = await fetch(`${base}/webhooks/sepay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: raw,
  })
  return { status: res.status, body: await res.json().catch(() => null), raw }
}

test('HMAC: chữ ký hợp lệ → 200 {"success": true} và sự kiện được lưu', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await seedShop()
  try {
    await withServer(async (base) => {
      const body = payload()
      const raw = JSON.stringify(body)
      const timestamp = String(Math.floor(Date.now() / 1000))
      const signature = signPayload(raw, timestamp, SECRET)

      const res = await post(base, body, {
        'X-SePay-Signature': signature,
        'X-SePay-Timestamp': timestamp,
      })

      assert.equal(res.status, 200)
      assert.equal(res.body.success, true)
      assert.equal(res.body.duplicate, false)

      await new Promise((r) => setTimeout(r, 400))
      const { rows } = await pool.query(
        'SELECT provider, status FROM webhook_events WHERE shop_id = $1 AND external_id = $2',
        [shop.id, String(body.id)],
      )
      assert.deepEqual(rows, [{ provider: 'sepay', status: 'PROCESSED' }])
    })
  } finally {
    await dropShops(shop.id)
  }
})

test('HMAC: chữ ký sai → 401, không lưu sự kiện', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await seedShop()
  try {
    await withServer(async (base) => {
      const body = payload()
      const timestamp = String(Math.floor(Date.now() / 1000))

      const res = await post(base, body, {
        'X-SePay-Signature': 'sha256=' + 'a'.repeat(64),
        'X-SePay-Timestamp': timestamp,
      })

      assert.equal(res.status, 401)
      const { rows } = await pool.query(
        'SELECT id FROM webhook_events WHERE shop_id = $1 AND external_id = $2',
        [shop.id, String(body.id)],
      )
      assert.equal(rows.length, 0, 'sự kiện không được lưu')
    })
  } finally {
    await dropShops(shop.id)
  }
})

test('HMAC: thiếu header chữ ký → 401', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  await withServer(async (base) => {
    const res = await post(base, payload(), {})
    assert.equal(res.status, 401)
  })
})

test('HMAC: timestamp quá cũ (chống replay) → 401', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  await withServer(async (base) => {
    const body = payload()
    const raw = JSON.stringify(body)
    // Signature itself is valid, but the timestamp is 10 minutes old.
    const stale = String(Math.floor(Date.now() / 1000) - 600)
    const signature = signPayload(raw, stale, SECRET)

    const res = await post(base, body, {
      'X-SePay-Signature': signature,
      'X-SePay-Timestamp': stale,
    })
    assert.equal(res.status, 401)
  })
})

test('HMAC: payload bị sửa sau khi ký → 401', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  await withServer(async (base) => {
    const original = payload({ transferAmount: 250000 })
    const timestamp = String(Math.floor(Date.now() / 1000))
    // Sign the original, then send a different amount.
    const signature = signPayload(JSON.stringify(original), timestamp, SECRET)

    const res = await post(base, { ...original, transferAmount: 99999999 }, {
      'X-SePay-Signature': signature,
      'X-SePay-Timestamp': timestamp,
    })
    assert.equal(res.status, 401)
  })
})

test('chống trùng: cùng id gửi hai lần → lần hai duplicate, chỉ một sự kiện', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await seedShop()
  try {
    await withServer(async (base) => {
      const body = payload()
      const timestamp = String(Math.floor(Date.now() / 1000))
      const signature = signPayload(JSON.stringify(body), timestamp, SECRET)
      const headers = { 'X-SePay-Signature': signature, 'X-SePay-Timestamp': timestamp }

      const first = await post(base, body, headers)
      const second = await post(base, body, headers)

      assert.equal(first.body.duplicate, false)
      assert.equal(second.body.duplicate, true)

      const { rows } = await pool.query(
        'SELECT count(*)::int AS n FROM webhook_events WHERE shop_id = $1 AND external_id = $2',
        [shop.id, String(body.id)],
      )
      assert.equal(rows[0].n, 1)
    })
  } finally {
    await dropShops(shop.id)
  }
})

test('signPayload: đúng công thức sha256(HMAC) của `{timestamp}.{raw_body}`', () => {
  const raw = '{"id":1,"content":"DHABC123 chuyen tien"}'
  const timestamp = '1732700000'
  const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(`${timestamp}.${raw}`).digest('hex')
  assert.equal(signPayload(raw, timestamp, SECRET), expected)
  // A different timestamp must produce a different signature.
  assert.notEqual(signPayload(raw, '1732700001', SECRET), expected)
})
