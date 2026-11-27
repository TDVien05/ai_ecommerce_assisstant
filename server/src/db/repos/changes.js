import { pool, withTransaction } from '../pool.js'
import { HttpError } from '../../lib/httpError.js'
import { requireShopId } from './guard.js'

/** Tables an agent run may touch, and how to compare a row before undoing it. */
const TABLES = {
  orders: { table: 'orders' },
  ledger_entries: { table: 'ledger_entries' },
  products: { table: 'products' },
  customers: { table: 'customers' },
  conversations: { table: 'conversations' },
  todos: { table: 'todos' },
}

const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/

function assertIdentifier(name) {
  if (!IDENTIFIER.test(name)) throw new Error(`Unsafe SQL identifier: ${name}`)
  return name
}

function assertEntity(entity) {
  const known = TABLES[entity]
  if (!known) throw new Error(`Unknown change entity: ${entity}`)
  return known.table
}

/**
 * Append one row to the change log. Call it inside the same transaction as the write it
 * describes, so an undo never sees half of a run.
 */
export async function recordChange(shopId, { runId, entity, entityId, action, before = null, after = null }, db = pool) {
  requireShopId(shopId)
  assertEntity(entity)
  if (!['insert', 'update', 'delete'].includes(action)) throw new Error(`Unknown change action: ${action}`)
  const { rows } = await db.query(
    `INSERT INTO changes (shop_id, run_id, entity, entity_id, action, before, after)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, shop_id, run_id, entity, entity_id, action, before, after, created_at`,
    [shopId, runId, entity, String(entityId), action, before, after],
  )
  return rows[0]
}

export async function listByRun(shopId, runId, db = pool) {
  requireShopId(shopId)
  const { rows } = await db.query(
    'SELECT * FROM changes WHERE shop_id = $1 AND run_id = $2 ORDER BY id DESC',
    [shopId, runId],
  )
  return rows
}

/**
 * Undo every change of a run, newest first. Refuses when the run is older than 24 hours,
 * was already undone, or a touched row changed again after the run (the user edited it).
 */
export async function undoRun(shopId, runId) {
  requireShopId(shopId)
  return withTransaction(async (client) => {
    const run = await client.query(
      'SELECT id, status, created_at FROM agent_runs WHERE shop_id = $1 AND id = $2 FOR UPDATE',
      [shopId, runId],
    )
    const row = run.rows[0]
    if (!row) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy lượt chạy.')
    if (row.status === 'UNDONE') throw new HttpError(409, 'ALREADY_UNDONE', 'Lượt chạy này đã được hoàn tác.')
    if (Date.now() - new Date(row.created_at).getTime() > UNDO_WINDOW_MS) {
      throw new HttpError(409, 'UNDO_EXPIRED', 'Chỉ có thể hoàn tác trong vòng 24 giờ.')
    }

    const { rows: changes } = await client.query(
      'SELECT * FROM changes WHERE shop_id = $1 AND run_id = $2 ORDER BY id DESC',
      [shopId, runId],
    )

    for (const change of changes) {
      const table = assertIdentifier(assertEntity(change.entity))
      const current = await client.query(`SELECT * FROM ${table} WHERE shop_id = $1 AND id = $2`, [shopId, change.entity_id])
      const row = current.rows[0]

      if (change.action === 'insert') {
        if (!row) continue // already deleted by the user; nothing to undo
        await client.query(`DELETE FROM ${table} WHERE shop_id = $1 AND id = $2`, [shopId, change.entity_id])
        continue
      }

      if (change.action === 'update') {
        if (!row) throw new HttpError(409, 'CHANGE_CONFLICT', 'Dòng dữ liệu đã bị xóa sau lượt chạy này.')
        assertUnchanged(row, change.after)
        const keys = Object.keys(change.before ?? {}).filter((key) => !['id', 'shop_id', 'created_at'].includes(key))
        if (!keys.length) continue
        const sets = keys.map((key, i) => `${assertIdentifier(key)} = $${i + 3}`)
        await client.query(
          `UPDATE ${table} SET ${sets.join(', ')} WHERE shop_id = $1 AND id = $2`,
          [shopId, change.entity_id, ...keys.map((key) => change.before[key])],
        )
        continue
      }

      // action === 'delete' → put the snapshot back
      if (row) throw new HttpError(409, 'CHANGE_CONFLICT', 'Dòng dữ liệu đã được tạo lại sau lượt chạy này.')
      const snapshot = change.before ?? {}
      const keys = Object.keys(snapshot)
      const values = keys.map((key) => snapshot[key])
      const placeholders = keys.map((_, i) => `$${i + 1}`)
      await client.query(
        `INSERT INTO ${table} (${keys.map(assertIdentifier).join(', ')}) VALUES (${placeholders.join(', ')})`,
        values,
      )
    }

    await client.query(
      `UPDATE agent_runs SET status = 'UNDONE', updated_at = now(), finished_at = now()
        WHERE shop_id = $1 AND id = $2`,
      [shopId, runId],
    )
    return { runId, undone: changes.length }
  })
}

function assertUnchanged(row, after) {
  if (!after) return
  for (const [key, value] of Object.entries(after)) {
    if (['updated_at', 'created_at'].includes(key)) continue
    const current = row[key]
    const same = current instanceof Date ? new Date(value).getTime() === current.getTime() : current === value
    if (!same) {
      throw new HttpError(409, 'CHANGE_CONFLICT', 'Dòng dữ liệu đã bị sửa sau lượt chạy này, không thể hoàn tác.')
    }
  }
}
