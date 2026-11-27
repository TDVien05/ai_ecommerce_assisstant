import { MockFlowyAI } from './mock'
import type { FlowyAI } from './types'

export * from './types'
export { applyEvent } from './reduce'

/** Chỗ duy nhất chọn bản AI. Khi có AI thật, thay MockFlowyAI bằng bản gọi server. */
export const ai: FlowyAI = new MockFlowyAI()
