export type Period = 'today' | 'week' | 'month'

export function range(period: Period) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  const today = Date.UTC(get('year'), get('month') - 1, get('day')) - 7 * 60 * 60 * 1000
  const start = period === 'week' ? today - 6 * 86400000 : period === 'month' ? Date.UTC(get('year'), get('month') - 1, 1) - 7 * 60 * 60 * 1000 : today
  return { from: new Date(start).toISOString(), to: new Date(today + 86400000).toISOString() }
}
