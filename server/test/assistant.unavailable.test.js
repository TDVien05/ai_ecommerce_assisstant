import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

// Both tests share one process: env.js and the DB pool are built on the first import, so the
// test database and the AI-off settings must be in place before anything is imported.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
process.env.AI_MOCK = 'false'
process.env.AI_API_KEY = ''
process.env.AI_BASE_URL = ''
process.env.AI_MODEL = ''

const ctx = () => ({ shopId: randomUUID(), userId: randomUUID(), runId: randomUUID() })

test('assistant explains rule mode when no rule matches, without calling a provider', async () => {
  const { runAgent } = await import('../src/services/assistant/agent.js')
  const text = 'Viết giúp mình một bài thơ'
  const blocks = await runAgent({ text, history: [{ role: 'user', text }], ctx: ctx() })
  assert.equal(blocks.length, 1)
  assert.match(blocks[0].text, /không khả dụng/)
  assert.match(blocks[0].text, /chế độ cơ bản/)
})

test('rule mode answers a read question from the database when AI is off', { skip: !process.env.TEST_DATABASE_URL, timeout: 15000 }, async () => {
  const { runAgent } = await import('../src/services/assistant/agent.js')
  const { pool } = await import('../src/db/pool.js')
  const shopId = randomUUID()
  try {
    await pool.query('INSERT INTO shops (id,name) VALUES ($1,$2)', [shopId, 'Rule mode'])
    await pool.query(`INSERT INTO ledger_entries (shop_id,type,kind,category,amount,occurred_at) VALUES
      ($1,'INCOME','BUSINESS_REVENUE','SALES',250000,now()),
      ($1,'EXPENSE','EXPENSE','OTHER',40000,now())`, [shopId])
    const text = 'Lãi tháng này?'
    const blocks = await runAgent({ text, history: [{ role: 'user', text }], ctx: { ...ctx(), shopId } })
    assert.match(blocks[0].text, /chế độ cơ bản/)
    const card = blocks.find((block) => block.type === 'resultCard')
    assert.deepEqual(card.metrics.map((metric) => metric.value), [250000, 40000, 210000])

    const missing = await runAgent({ text: 'Đơn DHZZZZZZ', history: [], ctx: { ...ctx(), shopId } })
    assert.equal(missing.length, 1)
    assert.equal(missing[0].type, 'text')
    assert.doesNotMatch(missing[0].text, /không khả dụng/)
  } finally {
    await pool.query('DELETE FROM ledger_entries WHERE shop_id=$1', [shopId])
    await pool.query('DELETE FROM shops WHERE id=$1', [shopId])
    await pool.end()
  }
})
