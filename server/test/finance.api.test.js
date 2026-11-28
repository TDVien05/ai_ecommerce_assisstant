import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'

test('finance API validates entries, scopes shops and reports incomplete data', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  const { pool } = await import('../src/db/pool.js')
  const { env } = await import('../src/config/env.js')
  const { createApp } = await import('../src/app.js')
  const server = createApp().listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const url = `http://127.0.0.1:${server.address().port}/api/finance`, shop = randomUUID(), other = randomUUID()
  const headers = (shopId) => ({ Authorization: `Bearer ${jwt.sign({ shopId }, env.JWT_SECRET, { subject: randomUUID() })}`, 'Content-Type': 'application/json' })
  const request = (path, method = 'GET', body, shopId = shop) => fetch(url + path, { method, headers: headers(shopId), ...(body ? { body: JSON.stringify(body) } : {}) })
  const entry = { type: 'EXPENSE', kind: 'EXPENSE', channel: 'CASH', category: 'OTHER', amount: 123000, documentRef: null, documentDate: null, industry: null, note: 'Thử', occurredAt: '2026-11-28T04:00:00.000Z' }
  try {
    await pool.query('INSERT INTO shops (id,name) VALUES ($1,$2),($3,$4)', [shop, 'Finance A', other, 'Finance B'])
    assert.equal((await request('/ledger', 'POST', { ...entry, amount: -1 })).status, 400)
    assert.equal((await request('/ledger', 'POST', { ...entry, kind: 'BUSINESS_REVENUE' })).status, 400)
    const created = await request('/ledger', 'POST', entry)
    assert.equal(created.status, 201)
    const { entry: saved } = await created.json()
    assert.equal(saved.amount, entry.amount); assert.equal(saved.manual, true)
    assert.equal((await request('/ledger', 'GET', undefined, other)).status, 200)
    assert.equal((await (await request('/ledger', 'GET', undefined, other)).json()).items.length, 0)
    const ledger = await (await request('/ledger')).json()
    assert.equal(ledger.totals.expense, entry.amount)
    assert.equal((await request(`/ledger/${saved.id}`, 'DELETE', undefined, other)).status, 404)
    const summary = await request('/summary')
    assert.equal(summary.status, 200)
    assert.equal((await summary.json()).expenses, entry.amount)
    assert.equal((await request('/timeseries?interval=day')).status, 200)
    assert.equal((await request('/top-products')).status, 200)
    await pool.query("INSERT INTO ledger_entries (shop_id,type,category,amount,manual) VALUES ($1,'INCOME','SALES',100,false)", [shop])
    assert.equal((await request('/summary')).status, 409)
    assert.equal((await request('/timeseries')).status, 409)
    assert.equal((await request(`/ledger/${saved.id}`, 'DELETE')).status, 200)
    assert.equal((await request(`/ledger/${saved.id}`, 'DELETE')).status, 404)
  } finally { await new Promise((resolve) => server.close(resolve)); await pool.end() }
})
