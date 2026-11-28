import { z } from 'zod'
import { executeRead } from '../../db/assistant/query-data.js'
import { HttpError } from '../../lib/httpError.js'
import { entities } from './query-entities.js'
import { guardData } from './guard.js'

const bad = (message) => new HttpError(400, 'INVALID_QUERY', message)
const scalar = z.union([z.string().max(500), z.number().finite(), z.boolean()])
export const querySchema = z.object({
  entity: z.enum(Object.keys(entities)),
  fields: z.array(z.string().min(1).max(40)).max(12).default([]),
  filters: z.array(z.object({ field: z.string().min(1).max(40), op: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains']), value: scalar }).strict()).max(10).default([]),
  groupBy: z.array(z.object({ field: z.string().min(1).max(40), interval: z.enum(['day', 'week', 'month']).optional() }).strict()).max(2).default([]),
  metrics: z.array(z.object({ op: z.enum(['count', 'sum', 'avg', 'min', 'max']), field: z.string().min(1).max(40).optional() }).strict()).max(6).default([]),
  sort: z.object({ field: z.string().min(1).max(80), direction: z.enum(['asc', 'desc']) }).strict().optional(),
  limit: z.number().int().min(1).max(100).default(50),
}).strict()

const operators = { eq: '=', ne: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', contains: 'ILIKE' }
const functionNames = { count: 'COUNT', sum: 'SUM', avg: 'AVG', min: 'MIN', max: 'MAX' }
const metricLabels = { count: 'Số lượng', sum: 'Tổng', avg: 'Trung bình', min: 'Nhỏ nhất', max: 'Lớn nhất' }
const redact = (value) => value.replace(/(?:\+?\d[\d .()-]{7,}\d)/g, (match) => `${'*'.repeat(Math.max(0, match.length - 4))}${match.slice(-4)}`)
const statusLabels = { alerts: { OPEN:'Đang mở', HELD:'Đã giữ', DISMISSED:'Đã bỏ qua' }, orders: { AWAITING_PAYMENT:'Chờ thanh toán', PAID:'Đã thanh toán', SHIPPING:'Đang giao', COMPLETED:'Hoàn tất', CANCELLED:'Đã hủy', EXPIRED:'Hết hạn', REFUNDED:'Đã hoàn tiền' }, payments: { MATCHED:'Đã đối soát', UNDERPAID:'Thiếu tiền', NO_ORDER:'Chưa gắn đơn', IGNORED:'Đã bỏ qua' }, todos: { OPEN:'Đang mở', DONE:'Đã xong', DISMISSED:'Đã bỏ qua' } }
function safeNumber(value) { const number = Number(value); if (!Number.isSafeInteger(number)) throw bad('Kết quả số vượt giới hạn hỗ trợ.'); return number }
function fieldFor(entity, name, allowMasked = true) {
  const field = Object.hasOwn(entity.fields, name) ? entity.fields[name] : null
  if (!field || (!allowMasked && field.masked)) throw bad('Trường không được phép sử dụng.')
  return field
}

export async function queryData(input, ctx) {
  const parsed = querySchema.safeParse(input); if (!parsed.success) throw bad('Đặc tả truy vấn không hợp lệ.')
  const request = parsed.data, entity = entities[request.entity], columns = [], groups = []
  if (new Set(request.fields).size !== request.fields.length || new Set(request.groupBy.map((g) => g.field)).size !== request.groupBy.length) throw bad('Trường bị lặp.')
  for (const group of request.groupBy) {
    const field = fieldFor(entity, group.field, false)
    if (field.untrusted) throw bad('Không nhóm theo nội dung ngoài.')
    if (group.interval && field.kind !== 'date') throw bad('Chỉ nhóm ngày trên trường thời gian.')
    const expression = group.interval ? `date_trunc('${group.interval}', ${field.sql} AT TIME ZONE 'Asia/Ho_Chi_Minh')::date` : field.sql
    groups.push(expression)
    columns.push({ key: group.field, label: field.label, kind: field.kind, expression })
  }
  if (groups.length && !request.metrics.length) throw bad('Cần chỉ số khi nhóm dữ liệu.')
  if (request.metrics.length && request.fields.some((name) => !request.groupBy.some((g) => g.field === name))) throw bad('Trường hiển thị phải thuộc nhóm.')
  if (!request.metrics.length) for (const name of request.fields) {
    const field = fieldFor(entity, name)
    columns.push({ key: name, ...field, expression: field.kind === 'text' ? `left((${field.sql})::text, 500)` : field.sql })
  }
  for (const metric of request.metrics) {
    if (metric.op !== 'count' && !metric.field) throw bad('Chỉ số cần trường dữ liệu.')
    const field = metric.field ? fieldFor(entity, metric.field, false) : null
    if (field?.untrusted) throw bad('Không tổng hợp nội dung ngoài.')
    if (['sum', 'avg'].includes(metric.op) && !['money', 'number'].includes(field?.kind)) throw bad('Chỉ cộng hoặc tính trung bình trường số.')
    if (field?.kind === 'boolean' && metric.op !== 'count') throw bad('Không thể tổng hợp trường này.')
    const key = `${metric.op}${metric.field ? `_${metric.field}` : ''}`
    if (columns.some((item) => item.key === key)) throw bad('Chỉ số bị lặp.')
    const fn = functionNames[metric.op], expression = metric.op === 'count' ? `count(${field?.sql ?? '*'})` : metric.op === 'avg' ? `round(avg(${field.sql}))` : `${fn}(${field.sql})`
    columns.push({ key, label: `${metricLabels[metric.op]}${field ? ` ${field.label}` : ''}`, kind: metric.op === 'count' ? 'number' : field.kind, expression })
  }
  if (!columns.length) throw bad('Hãy chọn trường hoặc chỉ số cần xem.')
  const filters = request.filters.map((filter) => {
    const field = fieldFor(entity, filter.field, false)
    if (filter.op === 'contains' && field.kind !== 'text') throw bad('Chỉ tìm chuỗi trong trường chữ.')
    if (field.kind === 'date' && (typeof filter.value !== 'string' || !Number.isFinite(Date.parse(filter.value)))) throw bad('Ngày lọc không hợp lệ.')
    if (['number','money'].includes(field.kind) && (typeof filter.value !== 'number' || !Number.isSafeInteger(filter.value))) throw bad('Giá trị số không hợp lệ.')
    if (field.kind === 'boolean' && typeof filter.value !== 'boolean') throw bad('Giá trị đúng/sai không hợp lệ.')
    if (field.kind === 'text' && typeof filter.value !== 'string') throw bad('Giá trị chữ không hợp lệ.')
    if (typeof filter.value === 'string' && field.kind === 'text' && !['id','orderId','conversationId','customerId'].includes(filter.field) && redact(filter.value) !== filter.value) throw bad('Không lọc bằng số điện thoại hoặc số tài khoản đầy đủ.')
    const value = filter.op === 'contains' ? `%${filter.value.replace(/[\\%_]/g, '\\$&')}%` : filter.value
    return { sql: filter.op === 'contains' ? `(${field.sql})::text` : field.sql, operator: operators[filter.op], value }
  })
  let sort
  if (request.sort) {
    const position = columns.findIndex((column) => column.key === request.sort.field)
    if (position < 0 || columns[position].masked || columns[position].untrusted) throw bad('Trường sắp xếp không được phép.')
    sort = { position: position + 1, direction: request.sort.direction === 'asc' ? 'ASC' : 'DESC' }
  }
  let rows
  try { rows = await executeRead({ table: entity.table, scope: entity.scope, where: entity.where, columns, groups, filters, sort, limit: request.limit }, ctx.shopId) }
  catch (error) { if (error.code === '57014') throw new HttpError(408, 'QUERY_TIMEOUT', 'Truy vấn quá thời gian. Bạn thu hẹp điều kiện nhé.'); if (['22P02','22007','22008'].includes(error.code)) throw bad('Giá trị lọc không hợp lệ.'); throw error }
  const data = await Promise.all(rows.map(async (row) => Promise.all(columns.map(async (column, index) => {
    const value = row[`c${index}`]
    if (value === null) return { view: null, model: null }
    if (column.kind === 'money' || column.kind === 'number') { const number = safeNumber(value); return { view: number, model: number } }
    if (value instanceof Date) return { view: value.toISOString(), model: value.toISOString() }
    if (typeof value !== 'string') return { view: String(value), model: String(value) }
    const text = ['id', 'orderId', 'conversationId', 'customerId'].includes(column.key) ? value.slice(0, 500) : redact(value.slice(0, 500))
    if (!column.untrusted) return { view: column.key === 'status' ? statusLabels[request.entity]?.[text] ?? text : text, model: text }
    const checked = await guardData(text, { source: request.entity === 'messages' ? 'customer_message' : 'statement', channel: 'owner', ctx })
    return { view: text, model: checked.content }
  }))))
  return { source: entity.source, columns: columns.map(({ key, label, kind }) => ({ key, label, kind })), rows: data.map((row) => row.map((cell) => cell.view)), modelRows: data.map((row) => row.map((cell) => cell.model)), limit: request.limit, grouped: groups.length > 0, metrics: request.metrics.map((m) => `${m.op}${m.field ? `_${m.field}` : ''}`) }
}
