import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'

test('orders API scopes shops and enforces transitions', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  const { pool } = await import('../src/db/pool.js')
  const { env } = await import('../src/config/env.js')
  const { createApp } = await import('../src/app.js')
  const server = createApp().listen(0,'127.0.0.1')
  await new Promise((resolve) => server.once('listening',resolve))
  const url = `http://127.0.0.1:${server.address().port}/api/orders`
  const shop=randomUUID(), other=randomUUID(), customer=randomUUID(), id=randomUUID(), code=randomUUID()
  const headers = (shopId) => ({ Authorization:`Bearer ${jwt.sign({shopId},env.JWT_SECRET,{subject:randomUUID()})}`, 'Content-Type':'application/json' })
  const request = (path='',method='GET',body,shopId=shop) => fetch(url+path,{method,headers:headers(shopId),...(body ? {body:JSON.stringify(body)} : {})})
  try {
    await pool.query('INSERT INTO shops (id,name) VALUES ($1,$2),($3,$4)',[shop,'A',other,'B'])
    await pool.query('INSERT INTO customers (id,shop_id,psid,name) VALUES ($1,$2,$3,$4)',[customer,shop,randomUUID(),'Khách'])
    await pool.query(`INSERT INTO orders (id,shop_id,customer_id,payment_code,status,subtotal,shipping_fee,total) VALUES ($1,$2,$3,$4,'PAID',100,5,105)`,[id,shop,customer,code])
    await pool.query('INSERT INTO order_items (order_id,name_snapshot,unit_price,unit_cost,quantity) VALUES ($1,$2,50,30,2)',[id,'Hàng'])
    assert.equal((await fetch(url)).status,401)
    const list = await (await request()).json(); assert.equal(list.items.length,1); assert.equal(list.items[0].customerName,'Khách')
    assert.equal((await (await request('?status=SHIPPING')).json()).items.length,0)
    assert.equal((await (await request('', 'GET',undefined,other)).json()).items.length,0)
    assert.equal((await request(`/${id}`,'GET',undefined,other)).status,404)
    const detail = await (await request(`/${id}`)).json(); assert.equal(detail.order.total,105); assert.equal(detail.order.items[0].lineTotal,100)
    assert.equal((await request(`/${id}/status`,'PATCH',{status:'PAID'})).status,400)
    assert.equal((await request(`/${id}/status`,'PATCH',{status:'CANCELLED'})).status,409)
    assert.equal((await request(`/${id}/status`,'PATCH',{status:'SHIPPING'},other)).status,404)
    assert.equal((await request(`/${id}/status`,'PATCH',{status:'SHIPPING'})).status,200)
    assert.equal((await request(`/${id}/status`,'PATCH',{status:'COMPLETED'})).status,200)
    assert.equal((await request(`/${id}/status`,'PATCH',{status:'COMPLETED'})).status,409)
    assert.equal((await request('/invalid')).status,400)
    assert.equal((await request('?from=2026-11-29T00:00:00Z&to=2026-11-28T00:00:00Z')).status,400)
  } finally { await new Promise((resolve) => server.close(resolve)); await pool.end() }
})
