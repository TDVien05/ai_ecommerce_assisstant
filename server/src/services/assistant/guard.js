import { wrapUntrusted } from '../ai/index.js'
import { HttpError } from '../../lib/httpError.js'

// Temporary adapter; replace with guardrail.service.js when NV-00 is available.
export const checkInput = async () => ({ action: 'allow', category: 'ok', message: '', signals: [] })
export const guardData = async (content) => ({ content: wrapUntrusted(content, 'du_lieu'), flagged: false, signals: [] })
export function assertToolAllowed(tool, { channel }) {
  if (channel !== 'owner' || tool.tier !== 'read') throw new HttpError(403, 'TOOL_NOT_ALLOWED', 'Công cụ không được phép.')
}
export const checkOutput = async ({ text }) => ({ text, redacted: false, signals: [] })
