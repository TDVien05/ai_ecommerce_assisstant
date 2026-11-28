import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'

test('activity and book exports use shop-scoped real data', { skip: !process.env.TEST_DATABASE_URL, timeout: 15000 }, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  process.env.AI_MOCK = 'true'
  const { pool } = await import('../src/db/pool.js')
  const { env } = await import('../src/config/env.js')
  const { createApp } = await import('../src/app.js')
  const { setMockReplies } = await import('../src/services/ai/mock.js')
  const { runAgent } = await import('../src/services/assistant/agent.js')
  const a = randomUUID(), b = randomUUID(), user = randomUUID(), customer = randomUUID()
  const from = '2026-01-01T00:00:00.000Z', to = '2027-01-01T00:00:00.000Z'
  const server = createApp().listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve))
  const token = jwt.sign({ shopId: a }, env.JWT_SECRET, { subject: user })
  const get = (query) => fetch(`http://127.0.0.1:${server.address().port}/api/finance/ledger-book?${new URLSearchParams(query)}`, { headers: { Authorization: `Bearer ${token}` } })
  const invoke = async (shopId, name, input, text = 'Xem dữ liệu') => {
    setMockReplies([{ tool_calls: [{ id: randomUUID(), type: 'function', function: { name, arguments: JSON.stringify(input) } }] }, { content: 'Đã xem.' }])
    return runAgent({ text, history: [], ctx: { shopId, userId: user, runId: randomUUID() } })
  }
  try {
    await pool.query('INSERT INTO shops (id,name) VALUES ($1,$2),($3,$4)', [a, 'A', b, 'B'])
    await pool.query('INSERT INTO users (id,shop_id,email,password_hash) VALUES ($1,$2,$3,$4)', [user, a, `${user}@example.invalid`, 'x'])
    await pool.query('INSERT INTO customers (id,shop_id,psid) VALUES ($1,$2,$3)', [customer, a, randomUUID()])
    await pool.query("INSERT INTO orders (shop_id,customer_id,payment_code,status,subtotal,total,created_at) VALUES ($1,$2,$3,'PAID',90,90,'2026-06-01T00:00:00Z')", [a, customer, randomUUID()])
    await pool.query("INSERT INTO ledger_entries (shop_id,type,kind,channel,category,amount,note,occurred_at) VALUES ($1,'INCOME','BUSINESS_REVENUE','CASH','SALES',100,'first','2026-06-01T00:00:00Z'),($1,'EXPENSE','EXPENSE','BANK','OTHER',30,'second','2026-06-02T00:00:00Z'),($1,'INCOME',NULL,'CASH','OTHER',700,'unknown','2026-06-03T00:00:00Z'),($2,'INCOME','BUSINESS_REVENUE','CASH','SALES',9999,'other','2026-06-01T00:00:00Z')", [a, b])
    const blocks = await invoke(a, 'get_activity', { from, to })
    const cards = blocks.filter((item) => item.type === 'resultCard')
    assert.deepEqual(cards[0].metrics.map((m) => m.value), [2, 800])
    assert.equal(cards[0].metrics[0].unit, 'count')
    assert.deepEqual(cards[2].metrics.map((m) => m.value), [1, 90])
    assert.ok(cards.every((card) => card.metrics.length <= 3))
    assert.match(JSON.stringify(blocks), /chưa gắn đơn/)
    assert.doesNotMatch(JSON.stringify(blocks), /9999/)
    const exported = await invoke(a, 'export_ledger_book', { code: 'S1a-HKD', from, to })
    assert.equal(exported.find((item) => item.type === 'ledgerExport').code, 'S1a-HKD')
    const defaults = await invoke(a, 'export_ledger_book', {})
    assert.equal(defaults.find((item) => item.type === 'ledgerExport').code, 'S1a-HKD')
    const monthExport = await invoke(a, 'export_ledger_book', { code: 'S1a-HKD', from: '2026-10-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z' })
    assert.match(monthExport.find((item) => item.type === 'ledgerExport').warnings.join(' '), /Không có dữ liệu/)
    const cases = [
      ['hôm nay bán được bao nhiêu', 'get_summary', { from, to }, 'resultCard'],
      ['có mấy đơn', 'get_activity', { from, to }, 'resultCard'],
      ['xuất sổ tháng 10', 'export_ledger_book', { from: '2026-10-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z' }, 'ledgerExport'],
      ['tải sổ doanh thu excel', 'export_ledger_book', { from, to }, 'ledgerExport'],
    ]
    for (const [text, tool, input, expected] of cases) assert.ok((await invoke(a, tool, input, text)).some((block) => block.type === expected), text)
    setMockReplies([{ content: '123456' }])
    const help = await runAgent({ text: 'Bạn làm được gì?', history: [], ctx: { shopId: a, userId: user, runId: randomUUID() } })
    assert.match(help[0].text, /Hôm nay có bao nhiêu giao dịch/)
    setMockReplies([{ content: 'Bạn cho mình biết số tiền nhé.' }])
    const question = await runAgent({ text: 'Ghi khoản chi', history: [], ctx: { shopId: a, userId: user, runId: randomUUID() } })
    assert.match(question[0].text, /số tiền/)
    const response = await get({ code: 'S1a-HKD', from, to }); assert.equal(response.status, 200)
    const book = await response.json()
    assert.deepEqual(book.sections[0].rows.map((item) => item.cells.description), ['first'])
    assert.equal(book.sections[0].totals.amount, 100)
    assert.match(book.warnings.join(' '), /chưa phân loại/)
    const empty = await (await get({ code: 'S1a-HKD', from: '2024-01-01T00:00:00.000Z', to: '2025-01-01T00:00:00.000Z' })).json()
    assert.match(empty.warnings.join(' '), /Không có dữ liệu/)
    assert.equal((await get({ code: 'S1a-HKD', from: to, to: from })).status, 400)
  } finally { await new Promise((resolve) => server.close(resolve)); await pool.end() }
})
