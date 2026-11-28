import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

test('shop service validates, isolates shops and rolls back updates', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  const { pool } = await import('../src/db/pool.js')
  const { getShopSettings, updateShopSettings } = await import('../src/services/shop.service.js')
  const client = await pool.connect()
  const first = randomUUID()
  const second = randomUUID()
  try {
    await client.query('BEGIN')
    await client.query('INSERT INTO shops (id, name, fb_page_token) VALUES ($1, $2, $3), ($4, $5, $6)', [first, 'Cửa hàng A', 'secret-a', second, 'Cửa hàng B', 'secret-b'])
    const result = await updateShopSettings(first, { name: 'Tên mới', bankCode: 'vcb', bankAccountNumber: '12345678' }, { client })
    assert.equal(result.before.name, 'Cửa hàng A')
    assert.deepEqual(result.after, { name: 'Tên mới', bankCode: 'VCB', bankAccountNumber: '12345678', bankAccountName: null })
    assert.deepEqual(await getShopSettings(second, { client }), { name: 'Cửa hàng B', bankCode: null, bankAccountNumber: null, bankAccountName: null })
    assert.equal(JSON.stringify(result).includes('secret'), false)
    await assert.rejects(updateShopSettings(first, { fb_page_token: 'new-secret' }, { client }), { status: 400 })
    await assert.rejects(updateShopSettings(first, { bankAccountNumber: 'abc' }, { client }), { status: 400 })
    await assert.rejects(getShopSettings(randomUUID(), { client }), { status: 404 })
    await client.query('ROLLBACK')
    assert.equal((await client.query('SELECT count(*)::int AS count FROM shops WHERE id = $1', [first])).rows[0].count, 0)
  } finally {
    await client.query('ROLLBACK').catch(() => {})
    client.release()
    await pool.end()
  }
})
