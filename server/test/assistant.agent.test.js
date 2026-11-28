import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

test('agent uses verified ledger results and isolates shops', { skip: !process.env.TEST_DATABASE_URL, timeout: 15000 }, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  process.env.AI_MOCK = 'true'
  const { pool } = await import('../src/db/pool.js')
  const { setMockReplies } = await import('../src/services/ai/mock.js')
  const { runAgent, buildAgentMessages } = await import('../src/services/assistant/agent.js')
  const { createRegistry } = await import('../src/services/assistant/registry.js')
  const shopA = randomUUID(), shopB = randomUUID()
  const from = '2026-01-01T00:00:00.000Z', to = '2027-01-01T00:00:00.000Z'
  const toolCall = (name, input) => ({ id: randomUUID(), type: 'function', function: { name, arguments: JSON.stringify(input) } })
  const invoke = async (shopId, name, input) => {
    setMockReplies([{ tool_calls: [toolCall(name, input)] }, { content: 'Lãi 999999999 đồng.' }])
    return runAgent({ text: 'Tổng kết kỳ này', history: [{ role: 'user', text: 'Tổng kết kỳ này' }], ctx: { shopId, userId: randomUUID(), runId: randomUUID() } })
  }
  try {
    assert.throws(() => createRegistry().register({ name: 'unsafe', run() {} }))
    await pool.query('INSERT INTO shops (id,name) VALUES ($1,$2),($3,$4)', [shopA, 'Agent A', shopB, 'Agent B'])
    await pool.query(`INSERT INTO ledger_entries (shop_id,type,kind,category,amount,occurred_at) VALUES
      ($1,'INCOME','BUSINESS_REVENUE','SALES',100000,'2026-06-01T00:00:00Z'),
      ($1,'EXPENSE','EXPENSE','OTHER',30000,'2026-06-02T00:00:00Z'),
      ($1,'INCOME',NULL,'SALES',70000,'2026-06-03T00:00:00Z'),
      ($2,'INCOME','BUSINESS_REVENUE','SALES',999999,'2026-06-01T00:00:00Z')`, [shopA, shopB])
    const blocks = await invoke(shopA, 'get_summary', { from, to })
    const card = blocks.find((block) => block.type === 'resultCard')
    assert.deepEqual(card.metrics.map((metric) => metric.value), [100000, 30000, 70000])
    assert.match(card.updatedAt, /^\d{2}:\d{2}$/)
    assert.match(card.how[0].label, /chưa phân loại/)
    assert.match(card.source, /chưa phân loại/)
    assert.doesNotMatch(JSON.stringify(blocks), /999999/)
    const list = await invoke(shopA, 'list_ledger', { from, to, type: 'EXPENSE' })
    assert.equal(list.filter((block) => block.type === 'resultCard').length, 1)
    const listCard = list.find((block) => block.type === 'resultCard')
    assert.deepEqual(listCard.metrics.map((metric) => metric.value), [0, 30000])
    assert.match(listCard.updatedAt, /^\d{2}:\d{2}$/)
    assert.match(listCard.how[0].label, /02\/06.*Chi.*OTHER/)
    const all = await invoke(shopA, 'list_ledger', { from, to })
    const allCard = all.find((block) => block.type === 'resultCard')
    assert.deepEqual(allCard.metrics.map((metric) => metric.value), [170000, 30000])
    assert.ok(allCard.how.some((line) => line.label.includes('chưa phân loại')))
    assert.equal(new Set(allCard.how.map((line) => line.label)).size, allCard.how.length)
    await pool.query("INSERT INTO ledger_entries (shop_id,type,kind,category,amount,occurred_at) SELECT $1,'INCOME','PERSONAL','OTHER',1,'2026-07-01T00:00:00Z' FROM generate_series(1,101)", [shopA])
    const limited = await invoke(shopA, 'list_ledger', { from, to })
    const limitedCard = limited.find((block) => block.type === 'resultCard')
    assert.equal(limitedCard.how.length, 100)
    assert.match(limitedCard.source, /100 khoản mới nhất/)
    assert.equal(limitedCard.metrics[0].value, 100)
    const empty = await invoke(shopA, 'get_summary', { from: '2024-01-01T00:00:00.000Z', to: '2025-01-01T00:00:00.000Z' })
    assert.ok(empty.some((block) => block.text?.includes('Chưa có dữ liệu')))
    assert.equal(empty.length, 1)
    assert.match(empty[0].text, /2024.*2025/)
    assert.match(empty[0].text, /sao kê.*chưa được hỗ trợ/)
    const customer = randomUUID()
    await pool.query('INSERT INTO customers (id,shop_id,psid) VALUES ($1,$2,$3)',[customer,shopA,randomUUID()])
    for (let i = 0; i < 4; i++) await pool.query("INSERT INTO orders (shop_id,customer_id,payment_code,status,subtotal,total) VALUES ($1,$2,$3,'PAID',100,100)",[shopA,customer,randomUUID()])
    const orderCards = (await invoke(shopA,'list_orders',{status:'PAID'})).filter((block) => block.type === 'resultCard')
    assert.equal(orderCards.length,2)
    assert.equal(orderCards.flatMap((block) => block.metrics).length,4)
    assert.ok(orderCards.every((block) => block.metrics.length <= 3))
    const context = buildAgentMessages('Câu mới', [{ role: 'user', text: 'Câu cũ' }, { role: 'user', text: 'Câu mới' }])
    assert.match(context[0].content, /Chỉ xử lý yêu cầu ở tin nhắn người dùng cuối cùng/)
    assert.equal(context.at(-1).content, 'Câu mới')
    assert.match(context.at(-2).content, /Tin cũ chỉ để tham khảo: Câu cũ/)
    setMockReplies([{ tool_calls: [toolCall('get_summary', { from: '2024-01-01T00:00:00.000Z', to: '2025-01-01T00:00:00.000Z' }), toolCall('get_summary', { from: '2024-01-01T00:00:00.000Z', to: '2025-01-01T00:00:00.000Z' })] }, { content: 'Đã xem.' }])
    const deduped = await runAgent({ text: 'Câu mới', history: [{ role: 'user', text: 'Câu mới' }], ctx: { shopId: shopA, userId: randomUUID(), runId: randomUUID() } })
    assert.equal(deduped.length, 1)
  } finally { await pool.end() }
})
