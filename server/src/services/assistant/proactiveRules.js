import { formatTime } from './view.js'

const DAY = 86_400_000
const WEEK = 7 * DAY
const LOCAL_OFFSET = 7 * 3_600_000
export const PROACTIVE_LIMITS = Object.freeze({
  open: 5,
  scanInterval: 5 * 60_000,
  recentActivity: WEEK,
  recentFraud: WEEK,
  costHistory: 4,
  minimumCostWeeks: 2,
  costIncreasePercent: 20,
  revenueThreshold: 1_000_000_000,
  revenueReminderPercent: 80,
  materialChangePercent: 5,
  materialChangeVnd: 50_000,
})

export function periods(now) {
  const local = new Date(now.getTime() + LOCAL_OFFSET)
  const year = local.getUTCFullYear()
  const month = local.getUTCMonth()
  const start = (y, m, d) => Date.UTC(y, m, d) - LOCAL_OFFSET
  const weekStart = start(year, month, local.getUTCDate()) - ((local.getUTCDay() + 6) % 7) * DAY
  return {
    now,
    year,
    month: `${year}-${month + 1}`,
    week: new Date(weekStart).toISOString(),
    yearStart: new Date(start(year, 0, 1)),
    monthStart: new Date(start(year, month, 1)),
    weekStart: new Date(weekStart),
    historyStart: new Date(weekStart - PROACTIVE_LIMITS.costHistory * WEEK),
    fraudSince: new Date(now - PROACTIVE_LIMITS.recentFraud),
  }
}

const link = (page, actionLabel, filters = {}) => ({ target: { page, filters }, actionLabel })
const count = (label, value) => ({ label, value, unit: 'count' })
const result = (now, source, metrics, how = metrics) => ({ type: 'resultCard', metrics, source, how, updatedAt: formatTime(now) })
const safeAmount = (amount) => {
  const number = Number(amount)
  if (!Number.isSafeInteger(number)) throw new Error('Proactive amount exceeds the safe integer range')
  return number
}

export function riskyOrderNotice(order) {
  return {
    key: `risk:${order.id}`, rule: 'risk', priority: 0,
    headline: `Đơn ${order.payment_code} cần kiểm tra`,
    detail: 'Dữ liệu đơn hàng hoặc kết quả kiểm tra giao dịch ghi nhận rủi ro cao.',
    risk: 'high', ...link('orders', 'Xem đơn hàng', { code: order.payment_code }),
  }
}

export function fraudNotice(total, { now, week }) {
  if (!total) return null
  return {
    key: `fraud:${week}`, rule: 'fraud', priority: 1,
    headline: 'Có dấu hiệu bất thường cần kiểm tra',
    detail: 'Các kết quả này chưa có đơn hàng liên quan trong dữ liệu đối soát.',
    risk: 'high', ...link('fraud', 'Mở cảnh báo'),
    result: result(now, 'Kết quả kiểm tra của cửa hàng', [count('Kiểm tra mức cao trong bảy ngày qua', total)]),
  }
}

export function overdueNotice(total, { now, week }) {
  if (!total) return null
  return {
    key: `overdue:${week}`, rule: 'overdue', priority: 2,
    headline: 'Có đơn quá hạn thanh toán',
    detail: 'Bạn có thể mở danh sách đơn để kiểm tra từng đơn.',
    risk: 'mid', ...link('orders', 'Xem đơn quá hạn', { status: 'AWAITING_PAYMENT', overdue: '1' }),
    result: result(now, 'Đơn hàng', [count('Đơn còn chờ thanh toán đã hết hạn', total)]),
  }
}

export function costNotice(facts, { now, week }) {
  const { minimumCostWeeks, costIncreasePercent } = PROACTIVE_LIMITS
  if (facts.prior_weeks < minimumCostWeeks) return null
  const expenses = BigInt(facts.expenses), previous = BigInt(facts.prior_expenses)
  // Compare exact ratios. Only round the displayed average to the nearest đồng.
  if (previous === 0n || expenses * BigInt(facts.prior_weeks * 100) < previous * BigInt(100 + costIncreasePercent)) return null
  const weeks = BigInt(facts.prior_weeks)
  const average = (previous + weeks / 2n) / weeks
  const metrics = [
    { label: 'Chi từ đầu tuần', value: safeAmount(expenses) },
    { label: 'Chi trung bình mỗi tuần trước', value: safeAmount(average) },
  ]
  return {
    key: `cost:${week}`, rule: 'cost', priority: 3,
    headline: 'Chi tuần này cao hơn mức thường lệ',
    detail: 'Mình so sánh các khoản chi đã phân loại từ đầu tuần với những tuần có phát sinh chi trước đó.',
    risk: 'mid', ...link('ledger', 'Xem khoản chi tuần này', { period: 'calendar-week', type: 'EXPENSE' }),
    result: result(now, 'Sổ thu chi', metrics, [
      { label: 'Chi đã phân loại trong bốn tuần trước', value: safeAmount(previous) },
      count('Số tuần có khoản chi', facts.prior_weeks),
      { ...metrics[1], total: true },
      metrics[0],
    ]),
  }
}

export function unclassifiedNotice(total, { now, month }) {
  if (!total) return null
  return {
    key: `unclassified:${month}`, rule: 'unclassified', priority: 4,
    headline: 'Có khoản thu chi cần phân loại',
    detail: 'Bạn có thể xem các khoản trong tháng và yêu cầu mình chuẩn bị đề xuất.',
    ...link('ledger', 'Xem khoản chưa phân loại', { period: 'month', unclassified: '1' }),
    result: result(now, 'Sổ thu chi', [count('Khoản trong tháng chưa có phân loại phù hợp', total)]),
  }
}

export function revenueNotice(facts, { now, year }) {
  const { revenueThreshold, revenueReminderPercent } = PROACTIVE_LIMITS
  const revenue = safeAmount(facts.revenue)
  if (revenue < revenueThreshold * revenueReminderPercent / 100) return null
  return {
    key: `revenue:${year}`, rule: 'revenue', priority: 5,
    headline: 'Doanh thu trong sổ đã gần hoặc vượt mốc tham chiếu',
    detail: 'Mình cộng các khoản thu bán hàng đã phân loại từ đầu năm.',
    legal: true, ...link('ledger', 'Mở mẫu sổ', { tab: 'templates' }),
    result: result(now, 'Sổ thu chi', [
      { label: 'Doanh thu đã ghi từ đầu năm', value: revenue },
      { label: 'Mốc tham chiếu', value: revenueThreshold },
    ]),
  }
}

export function materiallyChanged(previous, next) {
  return (next.result?.metrics ?? []).some(({ unit, value }, index) => {
    const old = previous.result?.metrics[index]?.value
    if (old === undefined) return true
    const delta = Math.abs(value - old)
    return unit === 'count' ? delta > 0 : delta >= Math.max(
      PROACTIVE_LIMITS.materialChangeVnd, old * PROACTIVE_LIMITS.materialChangePercent / 100,
    )
  })
}
