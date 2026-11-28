const subscribers = new Map()
const busy = new Set()
const key = (shopId, conversationId) => JSON.stringify([shopId, conversationId])

export function subscribe(shopId, listener) {
  const listeners = subscribers.get(shopId) ?? new Set()
  listeners.add(listener)
  subscribers.set(shopId, listeners)
  return () => { listeners.delete(listener); if (!listeners.size) subscribers.delete(shopId) }
}

export function publish(shopId, event) {
  for (const listener of subscribers.get(shopId) ?? []) listener(event)
}

export function acquire(shopId, conversationId) {
  const id = key(shopId, conversationId)
  if (busy.has(id)) return false
  busy.add(id)
  return true
}
export function release(shopId, conversationId) { busy.delete(key(shopId, conversationId)) }
export function typingFor(shopId) {
  return [...busy].map((id) => JSON.parse(id)).filter(([shop]) => shop === shopId).map(([, conversation]) => conversation)
}
