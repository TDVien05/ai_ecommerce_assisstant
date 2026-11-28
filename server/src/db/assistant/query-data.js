import { pool } from '../pool.js'

// plan is constructed exclusively from the server-owned entity registry.
export async function executeRead(plan, shopId) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN READ ONLY')
    await client.query("SET LOCAL statement_timeout = '3000ms'")
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
    const result = await client.query(`SELECT ${select} FROM ${plan.table} WHERE ${conditions.join(' AND ')}${grouping}${sorting} LIMIT $${values.length}`, values)
    await client.query('COMMIT')
    return result.rows
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally { client.release() }
}
