// Rule mode: when the model is unavailable (AI_UNAVAILABLE), map the owner's request to ONE
// read tool by keyword matching. Never selects write or sensitive tools — those need the model
// to build a proposal. Returns { tool, input } or null (see docs/ai-interface.md).

const TIME_ZONE = 'Asia/Ho_Chi_Minh'
const OFFSET = '+07:00'
const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })

/** Lowercase, strip Vietnamese diacritics, collapse punctuation to single spaces. */
export function normalize(text) {
  return String(text ?? '')
    .toLocaleLowerCase('vi-VN')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Words are matched on the normalized text, surrounded by spaces so "lai" never matches "lain".
const has = (text, pattern) => new RegExp(`(?:^| )(?:${pattern})(?= |$)`).test(text)

// Calendar dates are plain UTC day numbers; only the final string carries the +07:00 offset.
function todayParts(now) {
  const [y, m, d] = dayFormatter.format(now).split('-').map(Number)
  return { y, m, d }
}
const utcDay = (y, m, d) => new Date(Date.UTC(y, m - 1, d))
const addDays = (date, days) => new Date(date.getTime() + days * 86400000)
const iso = (date) => `${date.toISOString().slice(0, 10)}T00:00:00${OFFSET}`
const range = (from, to) => ({ from: iso(from), to: iso(to) })

/** Period named in the text; `to` is exclusive. Defaults to the current month. */
export function parsePeriod(text, now = new Date()) {
  const { y, m, d } = todayParts(now)
  const today = utcDay(y, m, d)
  const monday = addDays(today, -((today.getUTCDay() + 6) % 7))
  const days = /(?:^| )(\d{1,3}) ngay (?:qua|gan day|gan nhat|vua qua)(?= |$)/.exec(text)
  if (days && Number(days[1]) >= 1 && Number(days[1]) <= 366) return range(addDays(today, 1 - Number(days[1])), addDays(today, 1))
  if (has(text, 'hom nay|ngay hom nay')) return range(today, addDays(today, 1))
  if (has(text, 'hom qua')) return range(addDays(today, -1), today)
  if (has(text, 'tuan truoc|tuan roi')) return range(addDays(monday, -7), monday)
  if (has(text, 'tuan nay|trong tuan')) return range(monday, addDays(monday, 7))
  if (has(text, 'thang truoc|thang roi')) return range(utcDay(y, m - 1, 1), utcDay(y, m, 1))
  if (has(text, 'nam nay')) return range(utcDay(y, 1, 1), utcDay(y + 1, 1, 1))
  if (has(text, 'nam truoc|nam ngoai|nam roi')) return range(utcDay(y - 1, 1, 1), utcDay(y, 1, 1))
  return range(utcDay(y, m, 1), utcDay(y, m + 1, 1))
}

// Order: most specific first — "chưa/chờ thanh toán" must win over "đã thanh toán".
const ORDER_STATUS = [
  ['AWAITING_PAYMENT', 'chua thanh toan|cho thanh toan|doi thanh toan|chua tra tien|chua chuyen khoan'],
  ['REFUNDED', 'hoan tien|da hoan tien'],
  ['PAID', 'da thanh toan|thanh toan roi|da tra tien|da chuyen khoan'],
  ['SHIPPING', 'dang giao|dang van chuyen|dang ship'],
  ['COMPLETED', 'hoan tat|hoan thanh|da giao|giao xong'],
  ['CANCELLED', 'da huy|bi huy|huy'],
  ['EXPIRED', 'het han|qua han'],
]

// Short words collide once diacritics are stripped: "lại" (again) → "lai" (lãi), "sữa" (milk) →
// "sua" (sửa), "đợi" (wait) → "doi" (đổi). For these, a message typed with diacritics must contain
// the exact accented word; the plain spelling only counts when the whole message has no diacritics.
const hasDiacritics = (raw) => /[̀-ͯđ]/.test(raw.toLocaleLowerCase('vi-VN').normalize('NFD'))
function hasExact(raw, value, accented, plain) {
  if (!hasDiacritics(raw)) return has(value, plain)
  const words = accented.replace(/ /g, '\\s+')
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${words})(?![\\p{L}\\p{N}])`, 'u').test(raw.toLocaleLowerCase('vi-VN').normalize('NFC'))
}
const mentionsProfit = (raw, value) => hasExact(raw, value, 'lãi|lỗ', 'lai|lo')
const asksToChange = (raw, value) => hasExact(raw, value,
  'ghi|thêm|xóa|xoá|sửa|đổi|cập nhật|chuyển đơn|đánh dấu|xác nhận|hủy đơn|huỷ đơn',
  'ghi|them|xoa|sua|doi|cap nhat|chuyen don|danh dau|xac nhan|huy don')

/**
 * Rule-mode intent for the owner channel.
 * @returns {{ tool: string, input: object } | null}
 */
export function classifyByRules(text, now = new Date()) {
  const raw = String(text ?? '')
  const value = normalize(raw)
  if (!value) return null
  // Requests to change data need the model and approval flow; rule mode answers reads only.
  if (asksToChange(raw, value)) return null

  const code = /(?<![A-Za-z0-9])(DH[0-9A-Z]{3,12})(?![A-Za-z0-9])/i.exec(raw)
  if (code) return { tool: 'get_order', input: { paymentCode: code[1].toUpperCase() } }

  if (has(value, 'don|don hang|don dat hang')) {
    const status = ORDER_STATUS.find(([, pattern]) => has(value, pattern))
    return { tool: 'list_orders', input: status ? { status: status[0] } : {} }
  }

  const period = parsePeriod(value, now)
  if (has(value, 'khoan chi|tien chi|chi tieu|cac khoan chi|da chi')) return { tool: 'list_ledger', input: { ...period, type: 'EXPENSE' } }
  if (has(value, 'khoan thu|tien thu|cac khoan thu|da thu')) return { tool: 'list_ledger', input: { ...period, type: 'INCOME' } }
  if (has(value, 'so thu chi|so sach|xem so|liet ke|danh sach|chi tiet|giao dich')) return { tool: 'list_ledger', input: period }
  if (mentionsProfit(raw, value) || has(value, 'loi nhuan|doanh thu|doanh so|tong ket|bao cao|thu chi|chi phi|tong thu|tong chi|kinh doanh|ban duoc')) return { tool: 'get_summary', input: period }
  return null
}

/** Shown when rule mode cannot help, so the owner knows what still works. */
export const RULE_MODE_HELP = 'Trợ lý AI hiện không khả dụng. Ở chế độ cơ bản, bạn vẫn có thể hỏi như: "Lãi tháng này", "Khoản chi tuần trước", "Sổ thu chi hôm nay", "Đơn chờ thanh toán" hoặc gõ mã đơn.'
