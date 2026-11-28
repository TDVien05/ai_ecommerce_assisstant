// Input of the /api/assistant routes. See docs/ARCHITECTURE.md, section "Validators".
import { z } from 'zod'
import { validate } from '../validate.js'
import { hasSensitiveDraftNumber } from '../../lib/sensitiveText.js'

const attachment = z.object({ fileId: z.string().uuid(), name: z.string().min(1).max(255) }).strict()
const message = z.object({
  conversationId: z.string().trim().min(1).max(200),
  text: z.string().max(10000),
  attachments: z.array(attachment).max(10),
}).strict().refine((value) => value.text.trim().length > 0 || value.attachments.length > 0)

export const send = validate(message, 'body', 'Tin nhắn không hợp lệ.')

export const answer = validate(z.object({ questionId: z.string().min(1).max(100), option: z.string().min(1).max(100) }).strict())
export const approval = validate(z.object({password:z.string().max(256).optional()}).strict().default({}))
export const messageDraft = validate(z.object({text:z.string().trim().min(1).max(2000).refine((value)=>!hasSensitiveDraftNumber(value)),conversationId:z.string().uuid()}).strict())
