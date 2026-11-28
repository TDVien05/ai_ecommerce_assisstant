import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

test('assistant reports unavailable AI without calling a provider', async () => {
  process.env.AI_MOCK = 'false'
  process.env.AI_API_KEY = ''
  process.env.AI_BASE_URL = ''
  process.env.AI_MODEL = ''
  const { runAgent } = await import('../src/services/assistant/agent.js')
  const { pool } = await import('../src/db/pool.js')
  try {
    const blocks = await runAgent({ text: 'Lãi tuần này?', history: [{ role: 'user', text: 'Lãi tuần này?' }], ctx: { shopId: randomUUID(), userId: randomUUID(), runId: randomUUID() } })
    assert.match(blocks[0].text, /không khả dụng/)
  } finally { await pool.end() }
})
