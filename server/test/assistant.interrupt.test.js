import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

test('shutdown records one interruption for a turn in progress', { skip: !process.env.TEST_DATABASE_URL, timeout: 15000 }, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  process.env.AI_MOCK = 'true'
  const { pool } = await import('../src/db/pool.js')
  const { sendMessage, interruptActive, recover } = await import('../src/services/assistant.service.js')
  const { typingFor } = await import('../src/services/assistant/events.js')
  const shopId = randomUUID(), userId = randomUUID()
  const lock = await pool.connect()
  try {
    await pool.query('INSERT INTO shops (id,name) VALUES ($1,$2)', [shopId, 'Interrupted test'])
    await lock.query('BEGIN')
    await lock.query('LOCK TABLE assistant_messages IN ACCESS EXCLUSIVE MODE')
    const sending = sendMessage({ shopId, userId }, { conversationId: 'hub', text: 'Tin đang gửi', attachments: [] })
    for (let i = 0; i < 50 && !typingFor(shopId).includes('hub'); i++) await new Promise((resolve) => setTimeout(resolve, 10))
    assert.ok(typingFor(shopId).includes('hub'))
    // Let the insert reach the lock before shutdown, then allow it to finish.
    await new Promise((resolve) => setTimeout(resolve, 100))
    const stopping = interruptActive()
    await lock.query('COMMIT')
    await sending
    await stopping
    await recover()
    const rows = await pool.query('SELECT body FROM assistant_messages WHERE shop_id=$1 ORDER BY seq', [shopId])
    assert.equal(rows.rowCount, 2)
    assert.equal(rows.rows[0].body.role, 'user')
    assert.match(rows.rows[1].body.blocks[0].text, /bị gián đoạn/)
    await assert.rejects(sendMessage({ shopId, userId }, { conversationId: 'hub', text: 'Khác', attachments: [] }), { status: 503 })
  } finally {
    await lock.query('ROLLBACK').catch(() => {})
    lock.release()
    await pool.end()
  }
})
