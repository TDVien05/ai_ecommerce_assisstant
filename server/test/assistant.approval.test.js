import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'

test('agent changes require approval, isolate shops and undo atomically', { skip: !process.env.TEST_DATABASE_URL, timeout: 30000 }, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  process.env.AI_MOCK = 'true'
  const { pool } = await import('../src/db/pool.js')
  const { env } = await import('../src/config/env.js')
  const { createApp } = await import('../src/app.js')
  const { setMockReplies, chat } = await import('../src/services/ai/mock.js')
  const { deleteManualEntry } = await import('../src/services/assistant/tools/finance.write.js')
  const app = createApp(), server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const url = `http://127.0.0.1:${server.address().port}`
  const shop = randomUUID(), otherShop = randomUUID(), user = randomUUID(), otherUser = randomUUID()
  const jwtFor = (shopId, userId) => jwt.sign({ shopId }, env.JWT_SECRET, { subject: userId })
  const auth = (shopId = shop, userId = user) => ({ Authorization: `Bearer ${jwtFor(shopId, userId)}`, 'Content-Type': 'application/json' })
  const post = (path, body, headers = auth()) => fetch(`${url}/api${path}`, { method: 'POST', headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const amount = 250000, date = '2026-11-28T03:00:00.000Z'
  const toolCall = (name, input) => ({ id: randomUUID(), type: 'function', function: { name, arguments: JSON.stringify(input) } })
  async function proposeMany(calls) {
    const before = await pool.query('SELECT count(*)::int AS n FROM assistant_steps WHERE shop_id=$1', [shop])
    const changes = []
    for (const [name, input] of calls) {
      if (name === 'add_ledger_entries') changes.push(...input.entries.map((data) => ({ entity:'ledger', action:'create', data })))
      if (name === 'delete_manual_entry') changes.push({ entity:'ledger', action:'delete', id:input.entryId })
      if (name === 'update_order_status') {
        const row = await pool.query('SELECT id FROM orders WHERE shop_id=$1 AND payment_code=$2', [shop,input.paymentCode])
        changes.push({ entity:'orders', action:'update', id:row.rows[0].id, data:{ status:input.status } })
      }
      if (name === 'update_shop_settings') changes.push({ entity:'shop', action:'update', data:input })
    }
    setMockReplies([{ tool_calls: [toolCall('propose_change', { changes })] }, { content: 'Đã chuẩn bị.' }])
    assert.equal((await post('/assistant/messages', { conversationId: 'hub', text: 'Thử đề xuất', attachments: [] })).status, 204)
    for (let i = 0; i < 100; i++) {
      const rows = await pool.query('SELECT * FROM assistant_steps WHERE shop_id=$1 ORDER BY created_at DESC', [shop])
      if (rows.rowCount > before.rows[0].n) return rows.rows[0]
      await new Promise((resolve) => setTimeout(resolve, 30))
    }
    throw new Error('No proposed step')
  }
  const propose = (name, input) => proposeMany([[name, input]])
  try {
    await pool.query('INSERT INTO shops (id,name) VALUES ($1,$2),($3,$4)', [shop, 'Approval A', otherShop, 'Approval B'])
    await pool.query('INSERT INTO users (id,shop_id,email,password_hash) VALUES ($1,$2,$3,$4),($5,$6,$7,$8)', [user, shop, `${user}@example.invalid`, 'test', otherUser, otherShop, `${otherUser}@example.invalid`, 'test'])
    const step = await propose('add_ledger_entries', { entries: [{ type: 'EXPENSE', kind: null, channel: null, amount, occurredAt: date, note: 'Chi thử' }] })
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM ledger_entries WHERE shop_id=$1', [shop])).rows[0].n, 0)
    assert.equal((await post(`/assistant/steps/${step.id}/approve`, undefined, auth(otherShop, otherUser))).status, 404)
    assert.equal((await post(`/assistant/steps/${step.id}/approve`)).status, 400)
    const [kind, channel] = step.view.questions
    setMockReplies([{ content: 'sentinel' }])
    assert.equal((await post(`/assistant/steps/${step.id}/answers`, { questionId: kind.id, option: 'không hợp lệ' })).status, 400)
    assert.equal((await post(`/assistant/steps/${step.id}/answers`, { questionId: kind.id, option: 'Chi phí kinh doanh' })).status, 204)
    assert.equal((await post(`/assistant/steps/${step.id}/answers`, { questionId: channel.id, option: 'Tiền mặt' })).status, 204)
    const approvals = await Promise.all([post(`/assistant/steps/${step.id}/approve`), post(`/assistant/steps/${step.id}/approve`)])
    assert.deepEqual(approvals.map((r) => r.status).sort(), [200, 409])
    const recorded = await pool.query('SELECT id,amount FROM ledger_entries WHERE shop_id=$1', [shop])
    assert.equal(recorded.rowCount, 1); assert.equal(recorded.rows[0].amount, amount)
    await pool.query('UPDATE ledger_entries SET amount=1 WHERE id=$1', [recorded.rows[0].id])
    assert.equal((await post(`/assistant/steps/${step.id}/undo`)).status, 409)
    assert.equal((await chat({ role: 'agent', messages: [] })).message.content, 'sentinel')
    await pool.query('UPDATE ledger_entries SET amount=$2 WHERE id=$1', [recorded.rows[0].id, amount])
    assert.equal((await post(`/assistant/steps/${step.id}/undo`)).status, 204)
    assert.equal((await post(`/assistant/steps/${step.id}/undo`)).status, 409)
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM ledger_entries WHERE shop_id=$1', [shop])).rows[0].n, 0)
    const fail = await propose('add_ledger_entries', { entries: [{ type: 'EXPENSE', kind: 'EXPENSE', channel: 'CASH', amount, occurredAt: date }, { type: 'INCOME', kind: 'EXPENSE', channel: 'CASH', amount, occurredAt: date }] })
    assert.equal((await post(`/assistant/steps/${fail.id}/approve`)).status, 400)
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM ledger_entries WHERE shop_id=$1', [shop])).rows[0].n, 0)
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM assistant_action_log WHERE step_id=$1', [fail.id])).rows[0].n, 0)
    const manual = await pool.query("INSERT INTO ledger_entries (shop_id,type,kind,channel,category,amount,manual) VALUES ($1,'EXPENSE','EXPENSE','CASH','OTHER',100,true),($1,'EXPENSE','EXPENSE','CASH','OTHER',200,false) RETURNING id,manual", [shop])
    const manualId = manual.rows.find((row) => row.manual).id
    const autoId = manual.rows.find((row) => !row.manual).id
    await assert.rejects(deleteManualEntry.propose({ entryId: autoId }, { shopId: shop }), { status: 409 })
    await assert.rejects(deleteManualEntry.propose({ entryId: manualId }, { shopId: otherShop }), { status: 404 })
    const deletion = await propose('delete_manual_entry', { entryId: manualId })
    assert.equal((await post(`/assistant/steps/${deletion.id}/approve`)).status, 200)
    assert.equal((await pool.query('SELECT 1 FROM ledger_entries WHERE id=$1', [manualId])).rowCount, 0)
    assert.equal((await post(`/assistant/steps/${deletion.id}/undo`)).status, 204)
    assert.equal((await pool.query('SELECT 1 FROM ledger_entries WHERE id=$1', [manualId])).rowCount, 1)
    const multi = await proposeMany([
      ['add_ledger_entries', { entries: [{ type: 'EXPENSE', kind: 'EXPENSE', channel: 'CASH', amount: 10, occurredAt: date }] }],
      ['add_ledger_entries', { entries: [{ type: 'EXPENSE', kind: 'EXPENSE', channel: 'CASH', amount: 20, occurredAt: date }] }],
    ])
    assert.equal(multi.actions.length, 2)
    assert.equal((await post(`/assistant/steps/${multi.id}/approve`)).status, 200)
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM ledger_entries WHERE shop_id=$1 AND amount IN (10,20)', [shop])).rows[0].n, 2)
    assert.equal((await post(`/assistant/steps/${multi.id}/undo`)).status, 204)
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM ledger_entries WHERE shop_id=$1 AND amount IN (10,20)', [shop])).rows[0].n, 0)
    const orderService = await import('../src/services/orders/order.service.js')
    assert.deepEqual(await orderService.listOrders(otherShop), [])
    // Chuyển trạng thái chỉ khi duyệt, kiểm tra từng nhánh và hoàn tác.
    const customer = randomUUID()
    await pool.query('INSERT INTO customers (id,shop_id,psid) VALUES ($1,$2,$3)', [customer,shop,randomUUID()])
    for (const [initial, target] of [['PAID','SHIPPING'],['SHIPPING','COMPLETED'],['AWAITING_PAYMENT','CANCELLED']]) {
      const code = randomUUID(), id = randomUUID()
      await pool.query('INSERT INTO orders (id,shop_id,customer_id,payment_code,status,subtotal,total) VALUES ($1,$2,$3,$4,$5,100,100)', [id,shop,customer,code,initial])
      const orderStep = await propose('update_order_status', { paymentCode: code, status: target })
      assert.equal((await pool.query('SELECT status FROM orders WHERE id=$1',[id])).rows[0].status, initial)
      assert.equal((await post(`/assistant/steps/${orderStep.id}/approve`,undefined,auth(otherShop,otherUser))).status,404)
      assert.equal((await post(`/assistant/steps/${orderStep.id}/approve`)).status,200)
      assert.equal((await pool.query('SELECT status FROM orders WHERE id=$1',[id])).rows[0].status,target)
      assert.equal((await post(`/assistant/steps/${orderStep.id}/undo`)).status,204)
      assert.equal((await pool.query('SELECT status FROM orders WHERE id=$1',[id])).rows[0].status,initial)
      const { updateOrderStatus } = await import('../src/services/assistant/tools/orders.js')
      await assert.rejects(updateOrderStatus.propose({paymentCode:code,status: target === 'COMPLETED' ? 'SHIPPING' : 'COMPLETED'}, {shopId:shop}),{status:409})
      await assert.rejects(updateOrderStatus.propose({paymentCode:code,status:target},{shopId:otherShop}),{status:404})
      assert.equal(updateOrderStatus.schema.safeParse({paymentCode:code,status:'PAID'}).success,false)
    }
    const { checkInput } = await import('../src/services/assistant/guard.js')
    assert.equal((await checkInput({text:'Đánh dấu đơn đã thanh toán'})).action,'refuse')
    assert.match((await checkInput({text:'Gán giao dịch vào đơn'})).message,/trang Giao dịch/)
    assert.equal((await checkInput({text:'Chuyển đơn đã thanh toán sang đang giao'})).action,'allow')
    for (const text of ['Đơn đặt hàng nào đã thanh toán?', 'Liệt kê đơn đã đặt và đã thanh toán', 'Don dat hang nao da thanh toan?', 'Liet ke don da dat va da thanh toan', 'Doanh thu gần nhất của đơn hàng là bao nhiêu?', 'Tiền ngân hàng nhận từ đơn hôm nay', 'Cho tôi xem 5 đơn gần đây', 'Doanh thu gan nhat cua don hang', 'Tien ngan hang nhan tu don hom nay']) assert.equal((await checkInput({text})).action,'allow')
    for (const text of ['Danh dau don da thanh toan', 'Xac nhan don da thanh toan', 'Chuyen don sang da thanh toan', 'Cap nhat don thanh da thanh toan', 'Gan giao dich vao don', 'Gán giao dịch này vào đơn DH1', 'Ghep giao dich nay cho don DH1', 'Đối soát giao dịch này vào đơn DH1', 'Đánh dấu đơn DH1 đã thanh toán']) assert.equal((await checkInput({text})).action,'refuse')
    const settings = await propose('update_shop_settings',{name:'Tên khác'})
    assert.match(settings.view.steps[0].label,/Approval A.*Tên khác/)
    assert.equal((await post(`/assistant/steps/${settings.id}/approve`)).status,200)
    assert.equal((await pool.query('SELECT name FROM shops WHERE id=$1',[shop])).rows[0].name,'Tên khác')
    const logs = await pool.query('SELECT before,after FROM assistant_action_log WHERE step_id=$1',[settings.id])
    assert.deepEqual(Object.keys(logs.rows[0].before).sort(),['name','order'])
    assert.equal((await post(`/assistant/steps/${settings.id}/undo`)).status,204)
    assert.equal((await pool.query('SELECT name FROM shops WHERE id=$1',[shop])).rows[0].name,'Approval A')
  } finally {
    await new Promise((resolve) => server.close(resolve))
    await pool.end()
  }
})
