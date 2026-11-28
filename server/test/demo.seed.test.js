process.env.NODE_ENV = 'test'
process.env.LOG_LEVEL = 'fatal'
process.env.JWT_SECRET = 'test-secret-only'

import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'

const { dropShops, dbAvailable, pool } = await import('../test-support/db.js')
const { seed, TEMPLATE_PAGE_ID } = await import('../src/db/seed.js')
const demo = await import('../src/services/demo/demo.service.js')
const products = await import('../src/db/repos/products.js')

after(async () => { await pool.end() })
before(async () => {
  if (await dbAvailable()) await seed()
})

async function counts(shopId) {
  const { rows } = await pool.query(
    `SELECT (SELECT count(*) FROM products WHERE shop_id = $1)::int AS products,
            (SELECT count(*) FROM customers WHERE shop_id = $1)::int AS customers,
            (SELECT count(*) FROM orders WHERE shop_id = $1)::int AS orders,
            (SELECT count(*) FROM ledger_entries WHERE shop_id = $1)::int AS ledger,
            (SELECT count(*) FROM payment_transactions WHERE shop_id = $1)::int AS payments`,
    [shopId],
  )
  return rows[0]
}

test('seed: chạy hai lần không nhân đôi dữ liệu', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')
  const first = await counts((await demo.findTemplate()).id)
  await seed()
  const second = await counts((await demo.findTemplate()).id)
  assert.deepEqual(second, first)
  assert.ok(first.products >= 15 && first.products <= 20, 'khoảng 15-20 sản phẩm')
  assert.equal(first.customers, 25)
  assert.ok(first.orders >= 55, 'khoảng 60 đơn')
})

test('createDemoShop: hai phiên ra hai shop riêng, sửa shop này không ảnh hưởng shop kia', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')

  const template = await demo.findTemplate()
  const started = Date.now()
  const a = await demo.createDemoShop({ passwordHash: 'x' })
  const elapsed = Date.now() - started
  const b = await demo.createDemoShop({ passwordHash: 'x' })

  try {
    assert.notEqual(a.shopId, b.shopId)
    assert.ok(elapsed < 2000, `tạo shop thử mất ${elapsed}ms (yêu cầu < 2000ms)`)

    const templateCounts = await counts(template.id)
    const demoCounts = await counts(a.shopId)
    assert.deepEqual(demoCounts, templateCounts, 'bản sao phải đủ dữ liệu như shop mẫu')

    const [productA] = await products.list(a.shopId)
    await products.update(a.shopId, productA.id, { name: 'CHỈNH RIÊNG SHOP A' })

    const [productB] = await products.list(b.shopId)
    assert.notEqual(productB.name, 'CHỈNH RIÊNG SHOP A')
    assert.equal(await products.findById(b.shopId, productA.id), null, 'id sản phẩm không dùng chung')
  } finally {
    await dropShops(a.shopId, b.shopId)
  }
})

test('resetDemoShop: đặt lại đúng shop của phiên và từ chối shop thật', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')

  const template = await demo.findTemplate()
  const shop = await demo.createDemoShop({ passwordHash: 'x' })
  try {
    const before = await counts(shop.shopId)
    await products.deactivate(shop.shopId, (await products.list(shop.shopId))[0].id)
    await pool.query('DELETE FROM orders WHERE shop_id = $1', [shop.shopId])
    assert.notDeepEqual(await counts(shop.shopId), before, 'đã sửa dữ liệu trước khi reset')

    await demo.resetDemoShop(shop.shopId)
    assert.deepEqual(await counts(shop.shopId), await counts(template.id))

    await assert.rejects(() => demo.resetDemoShop(template.id), (err) => err.code === 'FORBIDDEN')
  } finally {
    await dropShops(shop.shopId)
  }
})

test('deleteExpiredDemoShops: chỉ xóa shop thử quá hạn, không đụng shop mẫu', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')

  const template = await demo.findTemplate()
  const expired = await demo.createDemoShop({ passwordHash: 'x' })
  const fresh = await demo.createDemoShop({ passwordHash: 'x' })
  try {
    await pool.query("UPDATE shops SET demo_expires_at = now() - interval '1 minute' WHERE id = $1", [expired.shopId])

    const deleted = await demo.deleteExpiredDemoShops()
    assert.ok(deleted >= 1)

    const remaining = await pool.query('SELECT id FROM shops WHERE id = ANY($1::uuid[])', [[expired.shopId, fresh.shopId, template.id]])
    const ids = remaining.rows.map((row) => row.id)
    assert.ok(!ids.includes(expired.shopId), 'shop quá hạn đã bị xóa')
    assert.ok(ids.includes(fresh.shopId), 'shop còn hạn vẫn giữ')
    assert.ok(ids.includes(template.id), 'shop mẫu không bị xóa')

    const orphans = await pool.query('SELECT count(*)::int AS n FROM products WHERE shop_id = $1', [expired.shopId])
    assert.equal(orphans.rows[0].n, 0, 'dữ liệu con bị xóa theo cascade')
  } finally {
    await dropShops(expired.shopId, fresh.shopId)
  }
})
