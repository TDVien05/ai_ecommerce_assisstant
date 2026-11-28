process.env.NODE_ENV = 'test'
process.env.LOG_LEVEL = 'fatal'
process.env.JWT_SECRET = 'test-secret-only'

import { test, after } from 'node:test'
import assert from 'node:assert/strict'

const { createShop, dropShops, dbAvailable, pool } = await import('../test-support/db.js')
const products = await import('../src/repositories/products/product.repository.js')
const customers = await import('../src/repositories/messenger/customer.repository.js')
const ledger = await import('../src/repositories/finance/ledgerEntry.repository.js')
const todos = await import('../src/repositories/shop/todo.repository.js')

after(async () => { await pool.end() })

test('repo: shop A không đọc được dữ liệu của shop B', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được (đặt DATABASE_URL)')

  const shopA = await createShop('isolation-A')
  const shopB = await createShop('isolation-B')
  try {
    const product = await products.create(shopA.id, { name: 'Áo thun', price: 150000, stock: 5 })
    await ledger.create(shopA.id, { type: 'INCOME', category: 'SALES', amount: 150000 })
    await todos.create(shopA.id, { title: 'Gọi khách' })
    await customers.create(shopA.id, { psid: 'psid-A' })

    assert.equal((await products.list(shopA.id)).length, 1)
    assert.equal((await products.list(shopB.id)).length, 0, 'shop B thấy sản phẩm của A')
    assert.equal(await products.findById(shopB.id, product.id), null)
    assert.equal((await ledger.list(shopB.id)).length, 0)
    assert.equal((await todos.list(shopB.id)).length, 0)
    assert.equal((await customers.list(shopB.id)).length, 0)

    await assert.rejects(() => products.list(null), /shopId is required/)
    await assert.rejects(() => ledger.list(''), /shopId is required/)
  } finally {
    await dropShops(shopA.id, shopB.id)
  }
})

test('repo: xóa shop thì dữ liệu con bị xóa theo (ON DELETE CASCADE)', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')

  const shop = await createShop('cascade')
  await products.create(shop.id, { name: 'Váy', price: 300000, stock: 2 })
  await ledger.create(shop.id, { type: 'EXPENSE', category: 'ADS', amount: 50000 })
  await dropShops(shop.id)

  const left = await pool.query(
    `SELECT (SELECT count(*) FROM products WHERE shop_id = $1) AS products,
            (SELECT count(*) FROM ledger_entries WHERE shop_id = $1) AS ledger`,
    [shop.id],
  )
  assert.deepEqual({ products: Number(left.rows[0].products), ledger: Number(left.rows[0].ledger) }, { products: 0, ledger: 0 })
})
