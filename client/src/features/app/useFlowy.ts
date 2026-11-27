import { useEffect, useReducer } from 'react'
import { ai, applyEvent } from '@/lib/ai'

/** Trạng thái giao diện dựng từ dòng sự kiện của AI. null khi chưa nhận snapshot. */
export function useFlowy() {
  const [state, dispatch] = useReducer(applyEvent, null)
  useEffect(() => ai.subscribe(dispatch), [])
  return state
}
