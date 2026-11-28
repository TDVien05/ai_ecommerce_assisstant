export type Period = 'today' | 'week' | 'calendar-week' | 'month'

export function range(period: Period) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  const today = Date.UTC(get('year'), get('month') - 1, get('day')) - 7 * 60 * 60 * 1000
  const day = 86_400_000
  const weekday = new Date(Date.UTC(get('year'), get('month') - 1, get('day'))).getUTCDay()
  const starts = {
    today,
    week: today - 6 * day,
    'calendar-week': today - ((weekday + 6) % 7) * day,
    month: Date.UTC(get('year'), get('month') - 1, 1) - 7 * 60 * 60 * 1000,
  }
  return { from: new Date(starts[period]).toISOString(), to: new Date(today + day).toISOString() }
}
