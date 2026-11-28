import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyByRules, parsePeriod, normalize } from '../src/services/assistant/fallback.js'
import { tools as financeTools } from '../src/services/assistant/tools/finance.read.js'
import { listOrders, getOrder } from '../src/services/assistant/tools/orders.js'

// Saturday 28/11/2026, 23:30 in Vietnam (16:30 UTC).
const now = new Date('2026-11-28T16:30:00Z')
const tools = Object.fromEntries([...financeTools, listOrders, getOrder].map((tool) => [tool.name, tool]))
// Same strict format ledger.service.period() requires.
const isoPeriod = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/

function expectTool(text, tool, input) {
  const match = classifyByRules(text, now)
  assert.ok(match, `expected a match for "${text}"`)
  assert.equal(match.tool, tool, text)
  if (input) assert.deepEqual(match.input, input, text)
  assert.ok(tools[match.tool].schema.safeParse(match.input).success, `schema rejects input for "${text}"`)
  for (const key of ['from', 'to']) if (match.input[key]) assert.match(match.input[key], isoPeriod)
  return match
}

test('normalize removes Vietnamese diacritics and punctuation', () => {
  assert.equal(normalize('  Lãi THÁNG này?? Đơn!'), 'lai thang nay don')
})

test('summary questions map to get_summary, with and without diacritics', () => {
  const week = { from: '2026-11-23T00:00:00+07:00', to: '2026-11-30T00:00:00+07:00' }
  expectTool('Lãi tuần này?', 'get_summary', week)
  expectTool('lai tuan nay', 'get_summary', week)
  expectTool('Doanh thu hôm nay', 'get_summary', { from: '2026-11-28T00:00:00+07:00', to: '2026-11-29T00:00:00+07:00' })
  expectTool('Tổng kết tháng trước', 'get_summary', { from: '2026-10-01T00:00:00+07:00', to: '2026-11-01T00:00:00+07:00' })
  expectTool('Báo cáo kinh doanh', 'get_summary', { from: '2026-11-01T00:00:00+07:00', to: '2026-12-01T00:00:00+07:00' })
  expectTool('Lợi nhuận 7 ngày qua', 'get_summary', { from: '2026-11-22T00:00:00+07:00', to: '2026-11-29T00:00:00+07:00' })
})

test('ledger questions map to list_ledger with the right type', () => {
  expectTool('Khoản chi tuần trước', 'list_ledger', { from: '2026-11-16T00:00:00+07:00', to: '2026-11-23T00:00:00+07:00', type: 'EXPENSE' })
  expectTool('cac khoan thu hom qua', 'list_ledger', { from: '2026-11-27T00:00:00+07:00', to: '2026-11-28T00:00:00+07:00', type: 'INCOME' })
  assert.equal(expectTool('Xem sổ thu chi', 'list_ledger').input.type, undefined)
})

test('order questions map to list_orders and get_order', () => {
  expectTool('Đơn hàng gần đây', 'list_orders', {})
  expectTool('Đơn đặt hàng nào đã thanh toán?', 'list_orders', { status: 'PAID' })
  expectTool('don chua thanh toan', 'list_orders', { status: 'AWAITING_PAYMENT' })
  expectTool('Đơn chờ thanh toán', 'list_orders', { status: 'AWAITING_PAYMENT' })
  expectTool('Đơn đang giao', 'list_orders', { status: 'SHIPPING' })
  expectTool('Kiểm tra đơn dh2lfs', 'get_order', { paymentCode: 'DH2LFS' })
})

test('write requests and unrelated text return null', () => {
  for (const text of ['Ghi khoản chi 50k tiền ship', 'Xóa khoản chi hôm qua', 'xoa khoan chi hom qua', 'Sửa khoản thu', 'Đánh dấu đơn DH2LFS đã thanh toán', 'Thời tiết hôm nay thế nào?', 'Gửi lại giúp mình', 'Sao bạn không trả lời?', 'Trả lời giúp mình', '', null]) {
    assert.equal(classifyByRules(text, now), null, String(text))
  }
})

test('accented words that only collide without diacritics still match', () => {
  // "sữa" (milk) and "đợi" (wait) must not be read as "sửa" (edit) and "đổi" (change).
  expectTool('Doanh thu sữa tháng này', 'get_summary')
  expectTool('Đơn đang đợi thanh toán', 'list_orders')
  expectTool('Lỗ tháng trước', 'get_summary')
})

test('periods handle year boundaries and Monday week start', () => {
  const january = new Date('2026-01-04T03:00:00Z') // Sunday 04/01/2026 in Vietnam
  assert.deepEqual(parsePeriod('thang truoc', january), { from: '2025-12-01T00:00:00+07:00', to: '2026-01-01T00:00:00+07:00' })
  assert.deepEqual(parsePeriod('tuan nay', january), { from: '2025-12-29T00:00:00+07:00', to: '2026-01-05T00:00:00+07:00' })
  const december = new Date('2026-12-15T03:00:00Z')
  assert.deepEqual(parsePeriod('', december), { from: '2026-12-01T00:00:00+07:00', to: '2027-01-01T00:00:00+07:00' })
  // 23:30 on 31/12 UTC is already 01/01 in Vietnam.
  assert.deepEqual(parsePeriod('hom nay', new Date('2026-12-31T17:30:00Z')), { from: '2027-01-01T00:00:00+07:00', to: '2027-01-02T00:00:00+07:00' })
})
