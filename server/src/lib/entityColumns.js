// Helpers for the TypeORM entity schemas in models/. The SQL migrations define the schema;
// these helpers only describe it. Keys are the real snake_case column names; defineModel
// exposes them as camelCase properties (shop_id → shopId). See docs/ARCHITECTURE.md.
import { EntitySchema } from 'typeorm'

/** bigint / bigserial → JS number, like db/pool.js; refuses values past Number.MAX_SAFE_INTEGER. */
const toNumber = {
  to: (value) => value,
  from: (value) => {
    if (value === null || value === undefined) return value
    const number = Number(value)
    if (!Number.isSafeInteger(number)) throw new Error('Unsafe integer from the database')
    return number
  },
}

const column = (type, extra = {}) => ({ type, nullable: false, ...extra })

export const uuid = () => column('uuid')
export const text = () => column('text')
export const int = () => column('integer')
export const bool = () => column('boolean')
export const json = () => column('jsonb')
export const bytes = () => column('bytea')
export const ts = () => column('timestamptz')
export const date = () => column('date')
/** Integer VND or any other bigint value. */
export const bigint = () => column('bigint', { transformer: toNumber })

export const uuidPk = () => column('uuid', { primary: true, generated: 'uuid' })
export const serialPk = () => column('bigint', { primary: true, generated: 'increment', transformer: toNumber })
/** Part of a composite primary key whose value the caller supplies. */
export const key = (spec) => ({ ...spec, primary: true })
/** A bigserial that is not the primary key: the database fills it, TypeORM never writes it. */
export const serial = () => column('bigint', { insert: false, update: false, transformer: toNumber })
export const createdAt = () => column('timestamptz', { createDate: true })
export const updatedAt = () => column('timestamptz', { updateDate: true })
/** Mark a column as nullable. */
export const opt = (spec) => ({ ...spec, nullable: true })
export const unique = (spec) => ({ ...spec, unique: true })

const camel = (name) => name.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase())

/**
 * @param {string} name entity name, e.g. 'LedgerEntry'
 * @param {string} tableName database table, e.g. 'ledger_entries'
 * @param {Record<string, object>} columns snake_case column name → column spec
 */
export function defineModel(name, tableName, columns) {
  const mapped = Object.fromEntries(Object.entries(columns).map(([columnName, spec]) => [camel(columnName), { ...spec, name: columnName }]))
  return new EntitySchema({ name, tableName, columns: mapped })
}
