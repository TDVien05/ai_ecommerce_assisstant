import { query } from '../../config/database.js'
import { requireShopId } from '../guard.js'

// plan is constructed exclusively from the server-owned entity registry.
export async function executeRead(shopId, plan, client) {
  requireShopId(shopId)
  if (!client) throw new Error('A transaction is required')
  await query('SET TRANSACTION READ ONLY', [], client)
  await query("SET LOCAL statement_timeout = '3000ms'", [], client)
  const values = [shopId]
  const conditions = [`${plan.scope} = $1`, ...(plan.where ? [plan.where] : [])]
  for (const filter of plan.filters) {
    values.push(filter.value)
    conditions.push(`${filter.sql} ${filter.operator} $${values.length}${filter.operator === 'ILIKE' ? " ESCAPE '\\'" : ''}`)
  }
  values.push(plan.limit)
  const select = plan.columns.map((column, index) => `${column.expression} AS c${index}`).join(', ')
  const grouping = plan.groups.length ? ` GROUP BY ${plan.groups.join(', ')}` : ''
  const sorting = plan.sort ? ` ORDER BY ${plan.sort.position} ${plan.sort.direction}` : ''
  const result = await query(`SELECT ${select} FROM ${plan.table} WHERE ${conditions.join(' AND ')}${grouping}${sorting} LIMIT $${values.length}`, values, client)
  return result.rows
}
