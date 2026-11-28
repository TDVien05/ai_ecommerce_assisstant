// Model A: each shop has its own SePay webhook secret, stored encrypted.
process.env.NODE_ENV = 'test'
process.env.LOG_LEVEL = 'fatal'
process.env.JWT_SECRET = 'test-secret-only'
process.env.APP_ENCRYPTION_KEY = 'test-encryption-key-32-characters-long!!'
process.env.SEPAY_WEBHOOK_SECRET = ''

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

const { createShop, dropShops, dbAvailable, pool } = await import('../test-support/db.js')
const { signPayload } = await import('../src/middlewares/verifySepaySignature.js')
const { encryptSecret, decryptSecret, maskSecret } = await import('../src/lib/secrets.js')
const shopRepo = await import('../src/repositories/shop/shop.repository.js')
const { createApp } = await import('../src/app.js')

after(async () => { await pool.end() })

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

async function seedShopWithSecret(secret) {
  const account = `30${String(Date.now()).slice(-7)}${Math.floor(Math.random() * 10)}`
  const shop = await createShop(`model-a-${Date.now()}-${Math.random()}`, {
    bank_account_number: account,
    bank_code: 'MB',
  })
  await shopRepo.saveWebhookSecret(shop.id, encryptSecret(secret), 'sepay')
  return { shop, account }
}

const payloadFor = (account, overrides = {}) => ({
  id: Date.now() + Math.floor(Math.random() * 1000),
  gateway: 'MB',
  transactionDate: '2026-11-28 15:20:00',
  accountNumber: account,
  code: 'DHABC123',
  content: 'DHABC123 chuyen tien',
  transferType: 'in',
  transferAmount: 250000,
  referenceCode: `FT${Date.now()}`,
  ...overrides,
})

function signedRequest(base, shopId, body, secret) {
  const raw = JSON.stringify(body)
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = signPayload(raw, timestamp, secret)
  return fetch(`${base}/webhooks/sepay/${shopId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-SePay-Signature': signature,
      'X-SePay-Timestamp': timestamp,
    },
    body: raw,
  })
}

test('mã hoá: vòng encrypt → decrypt giữ nguyên giá trị, envelope khác plaintext', () => {
  const secret = 'sepay_live_abcdef1234567890'
  const stored = encryptSecret(secret)
  assert.match(stored, /^v1:/)
  assert.doesNotMatch(stored, /sepay_live/)
  assert.equal(decryptSecret(stored), secret)
  assert.equal(maskSecret(secret), '****7890')
  assert.equal(encryptSecret(''), null)
  assert.equal(decryptSecret(null), null)
})

test('mã hoá: envelope bị sửa thì decrypt ném lỗi', () => {
  const stored = encryptSecret('mot-bi-mat-dai-hon-16-ky-tu')
  const parts = stored.split(':')
  parts[3] = Buffer.from('noi-dung-khac').toString('base64')
  assert.throws(() => decryptSecret(parts.join(':')))
})

test('mỗi shop một secret: shop A verify được, shop B cùng URL thì không', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const a = await seedShopWithSecret('secret-cua-shop-A-1234567890')
  const b = await seedShopWithSecret('secret-cua-shop-B-1234567890')
  try {
    await withServer(async (base) => {
      // Signed with A's secret but posted to B's URL: must be rejected.
      const body = payloadFor(b.account)
      const res = await signedRequest(base, b.shop.id, body, 'secret-cua-shop-A-1234567890')
      assert.equal(res.status, 401)

      // Same secret, correct shop URL: accepted.
      const ok = await signedRequest(base, a.shop.id, payloadFor(a.account), 'secret-cua-shop-A-1234567890')
      assert.equal(ok.status, 200)
      assert.equal((await ok.json()).success, true)
    })
  } finally {
    await dropShops(a.shop.id, b.shop.id)
  }
})

test('mỗi shop một secret: đúng secret của shop đó thì 200 và gắn đúng shop', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const { shop, account } = await seedShopWithSecret('secret-rieng-cua-shop-1234567890')
  try {
    await withServer(async (base) => {
      const body = payloadFor(account)
      const res = await signedRequest(base, shop.id, body, 'secret-rieng-cua-shop-1234567890')
      assert.equal(res.status, 200)

      await new Promise((r) => setTimeout(r, 400))
      const { rows } = await pool.query(
        'SELECT shop_id, status FROM webhook_events WHERE external_id = $1',
        [String(body.id)],
      )
      assert.deepEqual(rows, [{ shop_id: shop.id, status: 'PROCESSED' }])
    })
  } finally {
    await dropShops(shop.id)
  }
})

test('shop chưa cấu hình secret: route theo shopId trả 503', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const shop = await createShop(`no-secret-${Date.now()}-${Math.random()}`)
  try {
    await withServer(async (base) => {
      const res = await signedRequest(base, shop.id, payloadFor('123'), 'bat-ky-secret-nao-1234567890')
      assert.equal(res.status, 503)
    })
  } finally {
    await dropShops(shop.id)
  }
})

test('shop A không đọc được secret của shop B qua API cấu hình', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const a = await seedShopWithSecret('secret-shop-A-1234567890abcdef')
  const b = await seedShopWithSecret('secret-shop-B-1234567890abcdef')
  try {
    const service = await import('../src/services/shop/payment.service.js')
    const configA = await service.getPaymentConfig(a.shop.id)
    const configB = await service.getPaymentConfig(b.shop.id)

    assert.equal(configA.hasSecret, true)
    assert.equal(configA.secretMask, '****cdef')
    assert.equal(configB.secretMask, '****cdef')
    // The plaintext never leaves the service.
    assert.doesNotMatch(JSON.stringify(configA), /secret-shop-A-1234567890/)
    assert.equal(configA.webhookPath, `/webhooks/sepay/${a.shop.id}`)
  } finally {
    await dropShops(a.shop.id, b.shop.id)
  }
})

test('xác thực chữ ký: thiếu header và timestamp cũ đều bị từ chối', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const { shop, account } = await seedShopWithSecret('secret-cho-test-header-12345')
  try {
    await withServer(async (base) => {
      const missing = await fetch(`${base}/webhooks/sepay/${shop.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadFor(account)),
      })
      assert.equal(missing.status, 401)

      const body = payloadFor(account)
      const raw = JSON.stringify(body)
      const stale = String(Math.floor(Date.now() / 1000) - 900)
      const staleRes = await fetch(`${base}/webhooks/sepay/${shop.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-SePay-Signature': signPayload(raw, stale, 'secret-cho-test-header-12345'),
          'X-SePay-Timestamp': stale,
        },
        body: raw,
      })
      assert.equal(staleRes.status, 401)
    })
  } finally {
    await dropShops(shop.id)
  }
})

test('signPayload vẫn đúng công thức sha256(HMAC) `{timestamp}.{raw_body}`', () => {
  const raw = '{"id":1}'
  const ts = '1732700000'
  const expected = 'sha256=' + crypto.createHmac('sha256', 'sss').update(`${ts}.${raw}`).digest('hex')
  assert.equal(signPayload(raw, ts, 'sss'), expected)
})
