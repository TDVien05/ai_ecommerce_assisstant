import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
const { DataSource } = await import('typeorm')
const { dataSourceOptions } = await import('../src/db/dataSource.js')

const migrations = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/db/migrations')
const TYPES = { uuid: 'uuid', text: 'text', integer: 'integer', boolean: 'boolean', jsonb: 'jsonb', bytea: 'bytea', timestamptz: 'timestamptz', date: 'date', bigint: 'bigint', bigserial: 'bigint' }
const NOT_COLUMN = /^(primary|unique|foreign|check|constraint)\b/i

// Split on commas that are not inside parentheses.
function splitTopLevel(body) {
  const parts = []; let depth = 0, current = ''
  for (const char of body) {
    if (char === '(') depth++
    if (char === ')') depth--
    if (char === ',' && depth === 0) { parts.push(current); current = '' } else current += char
  }
  if (current.trim()) parts.push(current)
  return parts.map((part) => part.trim()).filter(Boolean)
}

/** table → column → { type, nullable, primary }, built from every migration in order. */
function schemaFromMigrations() {
  const tables = new Map()
  const files = fs.readdirSync(migrations).filter((file) => file.endsWith('.sql')).sort()
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrations, file), 'utf8').replace(/--[^\n]*/g, '').replace(/\$\$[\s\S]*?\$\$/g, '')
    for (const statement of sql.split(';')) {
      const create = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)\s*\(([\s\S]*)\)\s*$/i.exec(statement.trim())
      if (create) {
        const columns = new Map()
        for (const part of splitTopLevel(create[2])) {
          const primaryKey = /^PRIMARY KEY\s*\(([^)]+)\)/i.exec(part)
          if (primaryKey) { for (const name of primaryKey[1].split(',')) Object.assign(columns.get(name.trim()), { primary: true, nullable: false }); continue }
          if (NOT_COLUMN.test(part)) continue
          const [, name, type] = /^(\w+)\s+(\w+)/.exec(part)
          const primary = /\bPRIMARY KEY\b/i.test(part)
          columns.set(name, { type: TYPES[type.toLowerCase()] ?? type.toLowerCase(), nullable: !(primary || /\bNOT NULL\b/i.test(part)), primary })
        }
        tables.set(create[1], columns)
        continue
      }
      const alter = /ALTER TABLE\s+(\w+)\s+([\s\S]*)$/i.exec(statement.trim())
      if (!alter || !tables.has(alter[1])) continue
      const columns = tables.get(alter[1])
      for (const action of splitTopLevel(alter[2])) {
        const add = /^ADD COLUMN\s+(?:IF NOT EXISTS\s+)?(\w+)\s+(\w+)/i.exec(action)
        if (add) { if (!columns.has(add[1])) columns.set(add[1], { type: TYPES[add[2].toLowerCase()] ?? add[2].toLowerCase(), nullable: !/\bNOT NULL\b/i.test(action), primary: false }); continue }
        const notNull = /^ALTER COLUMN\s+(\w+)\s+(SET|DROP) NOT NULL/i.exec(action)
        if (notNull) columns.get(notNull[1]).nullable = notNull[2].toUpperCase() === 'DROP'
        const drop = /^DROP COLUMN\s+(?:IF EXISTS\s+)?(\w+)/i.exec(action)
        if (drop) columns.delete(drop[1])
      }
    }
  }
  return tables
}

async function modelSchema() {
  const dataSource = new DataSource(dataSourceOptions)
  await dataSource.buildMetadatas()
  return new Map(dataSource.entityMetadatas.map((meta) => [meta.tableName, new Map(meta.columns.map((column) => [column.databaseName, { type: String(column.type), nullable: column.isNullable, primary: column.isPrimary }]))]))
}

test('the migration parser finds the known schema', () => {
  const tables = schemaFromMigrations()
  assert.ok(tables.size >= 26)
  assert.deepEqual(tables.get('ledger_entries').get('manual'), { type: 'boolean', nullable: false, primary: false })
  assert.equal(tables.get('ledger_entries').get('kind').nullable, true)
  assert.equal(tables.get('assistant_messages').get('id').primary, true)
  assert.equal(tables.get('assistant_messages').get('shop_id').primary, true)
  assert.equal(tables.get('shops').get('is_demo').nullable, false)
})

test('every table has exactly one model and every model matches its migrations', async () => {
  const expected = schemaFromMigrations()
  const actual = await modelSchema()
  assert.deepEqual([...actual.keys()].sort(), [...expected.keys()].filter((table) => table !== 'schema_migrations').sort(), 'tables')
  for (const [table, columns] of expected) {
    const model = actual.get(table)
    assert.deepEqual([...model.keys()].sort(), [...columns.keys()].sort(), `${table}: columns`)
    for (const [name, column] of columns) assert.deepEqual(model.get(name), column, `${table}.${name}`)
  }
})

test('models read from a real database', { skip: !process.env.TEST_DATABASE_URL, timeout: 20000 }, async () => {
  const { getDataSource, closeDataSource } = await import('../src/db/dataSource.js')
  try {
    const dataSource = await getDataSource()
    for (const meta of dataSource.entityMetadatas) {
      const { rows } = { rows: await dataSource.query('SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1', [meta.tableName]) }
      assert.deepEqual(rows.map((row) => row.column_name).sort(), meta.columns.map((column) => column.databaseName).sort(), meta.tableName)
      await dataSource.getRepository(meta.target).find({ take: 1 })
    }
  } finally { await closeDataSource() }
})

test('bigint columns come back as safe JS numbers', async () => {
  const { LedgerEntry } = await import('../src/models/index.js')
  const { transformer } = LedgerEntry.options.columns.amount
  assert.equal(transformer.from('250000'), 250000)
  assert.equal(transformer.from(null), null)
  assert.throws(() => transformer.from('9007199254740993'), /Unsafe integer/)
})
