import type { AIEvent, Snapshot } from './types'

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  return list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]
}

/** Áp một sự kiện của AI lên trạng thái giao diện. Hàm thuần. */
export function applyEvent(state: Snapshot | null, event: AIEvent): Snapshot | null {
  if (event.type === 'snapshot') return event.snapshot
  if (!state) return state
  switch (event.type) {
    case 'message': {
      const list = state.conversations[event.conversationId] ?? []
      return {
        ...state,
        conversations: { ...state.conversations, [event.conversationId]: upsert(list, event.message) },
      }
    }
    case 'thread':
      return { ...state, threads: upsert(state.threads, event.thread) }
    case 'typing': {
      const others = state.typing.filter((id) => id !== event.conversationId)
      return { ...state, typing: event.value ? [...others, event.conversationId] : others }
    }
  }
}
