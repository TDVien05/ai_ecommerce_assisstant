const dateTime = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** "27/11 12:40" */
export function formatTime(iso: string) {
  const part = Object.fromEntries(dateTime.formatToParts(new Date(iso)).map((p) => [p.type, p.value]))
  return `${part.day}/${part.month} ${part.hour}:${part.minute}`
}
