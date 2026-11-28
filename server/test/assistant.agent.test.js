import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

test('agent uses verified ledger results and isolates shops', { skip: !process.env.TEST_DATABASE_URL, timeout: 15000 }, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  process.env.AI_MOCK = 'true'
  const { pool } = await import('../src/db/pool.js')
  const { setMockReplies } = await import('../src/services/ai/mock.js')
  const { runAgent } = await import('../src/services/assistant/agent.js')
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
    assert.match(card.how[0].label, /chưa phân loại/)
    assert.match(card.source, /chưa phân loại/)
    assert.doesNotMatch(JSON.stringify(blocks), /999999/)
    const list = await invoke(shopA, 'list_ledger', { from, to, type: 'EXPENSE' })
    assert.equal(list.find((block) => block.type === 'resultCard').metrics[0].value, 30000)
    const empty = await invoke(shopA, 'get_summary', { from: '2024-01-01T00:00:00.000Z', to: '2025-01-01T00:00:00.000Z' })
    assert.ok(empty.some((block) => block.text?.includes('Chưa có dữ liệu')))
  } finally { await pool.end() }
})
