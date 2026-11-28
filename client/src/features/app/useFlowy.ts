import { useEffect, useReducer, useState } from 'react'
import { ai, applyEvent, type AIConnection, type Block } from '@/lib/ai'

/** Trạng thái giao diện dựng từ dòng sự kiện của AI. null khi chưa nhận snapshot. */
export function useFlowy() {
  const [state, dispatch] = useReducer(applyEvent, null)
  const [connection, setConnection] = useState<AIConnection>('connecting')
  useEffect(() => ai.subscribe((event) => {
    if (event.type === 'snapshot') setConnection('connected')
    dispatch(event)
    const message = event.type === 'message' ? event.message : null
    if (event.type === 'snapshot' || (event.type === 'thread' && event.thread.id.startsWith('alert-')) || (message && (message.id.startsWith('risk-') || message.id.startsWith('notice-')))) window.dispatchEvent(new Event('flowy:alerts-changed'))
    const steps = message?.role === 'assistant' ? message.blocks.filter((block): block is Extract<Block, { type: 'agentStep' }> => block.type === 'agentStep' && (block.state === 'done' || block.state === 'undone')) : []
    if (steps.some((step) => step.entities?.includes('alerts'))) window.dispatchEvent(new Event('flowy:alerts-changed'))
    if (event.type === 'snapshot' || steps.some((step) => step.entities?.includes('ledger') || (!step.entities && (step.title === 'Thay đổi sổ thu chi' || step.steps.some((item) => /^(Thu |Chi |Xóa khoản )/.test(item.label)))))) window.dispatchEvent(new Event('flowy:ledger-changed'))
    if (event.type === 'snapshot' || steps.some((step) => step.entities?.includes('orders') || (!step.entities && step.steps.some((item) => item.label.startsWith('Đơn '))))) window.dispatchEvent(new Event('flowy:orders-changed'))
  }, setConnection), [])
  return { state, connection }
}
