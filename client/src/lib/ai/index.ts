import { MockFlowyAI } from './mock'
import { HttpFlowyAI } from './http'
import { isReal } from '@/lib/realApi'
import type { FlowyAI } from './types'

export * from './types'
export { applyEvent } from './reduce'

/** Chỗ duy nhất chọn bản AI. Khi có AI thật, thay MockFlowyAI bằng bản gọi server. */
export const ai: FlowyAI = isReal('assistant') ? new HttpFlowyAI() : new MockFlowyAI()
