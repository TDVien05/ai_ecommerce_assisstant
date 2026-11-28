import { useEffect, useReducer, useState } from 'react'
import { ai, applyEvent, type AIConnection } from '@/lib/ai'

/** Trạng thái giao diện dựng từ dòng sự kiện của AI. null khi chưa nhận snapshot. */
export function useFlowy() {
  const [state, dispatch] = useReducer(applyEvent, null)
  const [connection, setConnection] = useState<AIConnection>('connecting')
  useEffect(() => ai.subscribe((event) => {
    if (event.type === 'snapshot') setConnection('connected')
    dispatch(event)
    if (event.type === 'snapshot' || event.type === 'thread' || event.type === 'message') window.dispatchEvent(new Event('flowy:alerts-changed'))
    if (event.type === 'snapshot' || (event.type === 'message' && event.message.role === 'assistant' && event.message.blocks.some((block) => block.type === 'agentStep' && (block.state === 'done' || block.state === 'undone')))) {
      window.dispatchEvent(new Event('flowy:ledger-changed'))
      window.dispatchEvent(new Event('flowy:orders-changed'))
    }
  }, setConnection), [])
  return { state, connection }
}
