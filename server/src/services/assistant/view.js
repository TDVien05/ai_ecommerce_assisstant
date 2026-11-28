const clock = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

export function snapshotView(data, typing) {
  const conversations = { hub: [] }
  for (const thread of data.threads) conversations[thread.id] = []
  for (const row of data.messages) (conversations[row.conversation_id] ??= []).push(row.body)
  return {
    shopName: data.shopName,
    threads: data.threads.map((row) => ({ id: row.id, title: row.title, status: row.status, scope: row.scope, updatedAt: clock.format(row.updated_at) })),
    conversations,
    typing,
  }
}
