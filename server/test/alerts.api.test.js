import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'

test('alerts are idempotent, shop-scoped and never change order status', {skip:!process.env.TEST_DATABASE_URL,timeout:30000}, async () => {
  process.env.DATABASE_URL=process.env.TEST_DATABASE_URL
  const {pool,withTransaction}=await import('../src/db/pool.js');const {env}=await import('../src/config/env.js');const {createApp}=await import('../src/app.js');const {createAlert}=await import('../src/services/alerts.service.js')
  const shop=randomUUID(),other=randomUUID(),customer=randomUUID(),order=randomUUID(),code=randomUUID()
  const server=createApp().listen(0,'127.0.0.1');await new Promise((resolve)=>server.once('listening',resolve))
  const base=`http://127.0.0.1:${server.address().port}/api`
  const headers=(id)=>({Authorization:`Bearer ${jwt.sign({shopId:id},env.JWT_SECRET,{subject:randomUUID()})}`})
  const request=(path,method='GET',id=shop)=>fetch(base+path,{method,headers:headers(id)})
  try {
    await pool.query('INSERT INTO shops (id,name) VALUES ($1,$2),($3,$4)',[shop,'A',other,'B'])
    await pool.query('INSERT INTO customers (id,shop_id,psid) VALUES ($1,$2,$3)',[customer,shop,randomUUID()])
    await pool.query("INSERT INTO orders (id,shop_id,customer_id,payment_code,status,subtotal,total) VALUES ($1,$2,$3,$4,'AWAITING_PAYMENT',100,100)",[order,shop,customer,code])
    const input={eventKey:randomUUID(),level:'high',title:'Cần kiểm tra',reasons:['Cần xác minh'],orderId:order}
    const results=await Promise.all([createAlert(shop,input),createAlert(shop,input)])
    assert.deepEqual(results.map((value)=>value.created).sort(),[false,true]); const id=results[0].alert.id
    assert.equal((await pool.query('SELECT count(*)::int n FROM assistant_threads WHERE shop_id=$1',[shop])).rows[0].n,1)
    assert.equal((await pool.query("SELECT count(*)::int n FROM assistant_messages WHERE shop_id=$1 AND (id LIKE 'notice-%' OR id LIKE 'risk-%')",[shop])).rows[0].n,2)
    assert.equal((await (await request('/alerts')).json()).items.length,1)
    assert.equal((await (await request('/alerts?status=HELD')).json()).items.length,0)
    assert.equal((await request(`/alerts/${id}/hold`,'POST',other)).status,404)
    assert.equal((await request(`/assistant/notices/${id}/dismiss`,'POST',other)).status,404)
    assert.equal((await request(`/assistant/notices/${id}/dismiss`,'POST')).status,204)
    assert.equal((await (await request('/alerts')).json()).items[0].status,'OPEN')
    assert.equal((await request(`/assistant/alerts/${id}/safe-action`,'POST')).status,204)
    assert.equal((await (await request('/alerts?status=HELD')).json()).items[0].status,'HELD')
    assert.equal((await request(`/alerts/${id}/hold`,'POST')).status,409)
    assert.equal((await pool.query('SELECT status FROM orders WHERE id=$1',[order])).rows[0].status,'AWAITING_PAYMENT')
    await assert.rejects(createAlert(other,{...input,eventKey:randomUUID()}),{status:404})
    const second=await createAlert(shop,{eventKey:randomUUID(),level:'mid',title:'Cần xem',reasons:['Kiểm tra']})
    assert.equal((await request(`/alerts/${second.alert.id}/dismiss`,'POST')).status,200)
    assert.equal((await (await request('/alerts?status=DISMISSED')).json()).items.length,1)
    const eventKey=randomUUID();await assert.rejects(withTransaction(async(client)=>{await createAlert(shop,{eventKey,level:'mid',title:'Tạm',reasons:['Tạm']},{client});throw new Error('rollback')}),/rollback/)
    assert.equal((await pool.query("SELECT count(*)::int n FROM assistant_alerts WHERE shop_id=$1 AND title='Tạm'",[shop])).rows[0].n,0)
  } finally {await new Promise((resolve)=>server.close(resolve));await pool.end()}
})
