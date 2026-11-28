process.env.NODE_ENV = 'test'
process.env.LOG_LEVEL = 'fatal'
process.env.JWT_SECRET = 'test-secret-only'

import { test, after } from 'node:test'
import assert from 'node:assert/strict'

const { createShop, createAgentRun, dropShops, dbAvailable, pool } = await import('../test-support/db.js')
const ledger = await import('../src/db/repos/ledger.js')
const { recordChange, undoRun } = await import('../src/db/repos/changes.js')

after(async () => { await pool.end() })

test('undoRun: ghi ba thay đổi rồi hoàn tác thì dữ liệu về như trước', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')

  const shop = await createShop('undo')
  try {
    const run = await createAgentRun(shop.id)

    // two inserts + one update recorded in run order
    const first = await ledger.create(shop.id, { type: 'INCOME', category: 'SALES', amount: 200000, note: 'đơn 1' })
    await recordChange(shop.id, { runId: run.id, entity: 'ledger_entries', entityId: first.id, action: 'insert', after: first })

    const second = await ledger.create(shop.id, { type: 'EXPENSE', category: 'ADS', amount: 50000, note: 'quảng cáo' })
    await recordChange(shop.id, { runId: run.id, entity: 'ledger_entries', entityId: second.id, action: 'insert', after: second })

    const before = (await pool.query('SELECT * FROM ledger_entries WHERE id = $1', [second.id])).rows[0]
    await pool.query('UPDATE ledger_entries SET note = $2 WHERE id = $1', [second.id, 'quảng cáo tháng 11'])
    const after = (await pool.query('SELECT * FROM ledger_entries WHERE id = $1', [second.id])).rows[0]
    await recordChange(shop.id, { runId: run.id, entity: 'ledger_entries', entityId: second.id, action: 'update', before, after })

    assert.equal((await ledger.list(shop.id)).length, 2)

    const result = await undoRun(shop.id, run.id)
    assert.equal(result.undone, 3)

    const rows = await pool.query('SELECT * FROM ledger_entries WHERE shop_id = $1', [shop.id])
    assert.equal(rows.rows.length, 0, 'cả hai dòng của lượt chạy đã bị xóa')

    const state = await pool.query('SELECT status FROM agent_runs WHERE id = $1', [run.id])
    assert.equal(state.rows[0].status, 'UNDONE')
  } finally {
    await dropShops(shop.id)
  }
})

test('undoRun: hoàn tác lần hai bị từ chối', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')

  const shop = await createShop('undo-twice')
  try {
    const run = await createAgentRun(shop.id)
    await undoRun(shop.id, run.id)
    await assert.rejects(() => undoRun(shop.id, run.id), (err) => err.code === 'ALREADY_UNDONE')
  } finally {
    await dropShops(shop.id)
  }
})

test('undoRun: quá 24 giờ thì từ chối', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')

  const shop = await createShop('undo-expired')
  try {
    const run = await createAgentRun(shop.id)
    await pool.query("UPDATE agent_runs SET created_at = now() - interval '25 hours' WHERE id = $1", [run.id])
    await assert.rejects(() => undoRun(shop.id, run.id), (err) => err.code === 'UNDO_EXPIRED')
  } finally {
    await dropShops(shop.id)
  }
})

test('undoRun: dòng bị sửa sau lượt chạy thì từ chối', async (t) => {
  if (!(await dbAvailable())) return t.skip('PostgreSQL không truy cập được')

  const shop = await createShop('undo-conflict')
  try {
    const run = await createAgentRun(shop.id)
    const entry = await ledger.create(shop.id, { type: 'EXPENSE', category: 'ADS', amount: 10000, note: 'gốc' })
    await recordChange(shop.id, { runId: run.id, entity: 'ledger_entries', entityId: entry.id, action: 'insert', after: entry })

    const before = entry
    await pool.query("UPDATE ledger_entries SET note = 'agent' WHERE id = $1", [entry.id])
    const after = (await pool.query('SELECT * FROM ledger_entries WHERE id = $1', [entry.id])).rows[0]
    await recordChange(shop.id, { runId: run.id, entity: 'ledger_entries', entityId: entry.id, action: 'update', before, after })

    // the shop owner edits it again after the run
    await pool.query("UPDATE ledger_entries SET note = 'người dùng sửa' WHERE id = $1", [entry.id])
    await assert.rejects(() => undoRun(shop.id, run.id), (err) => err.code === 'CHANGE_CONFLICT')
  } finally {
    await dropShops(shop.id)
  }
})
