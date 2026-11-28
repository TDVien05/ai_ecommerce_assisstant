import { wrapUntrusted } from '../ai/index.js'
import { HttpError } from '../../lib/httpError.js'

// Temporary adapter; replace with guardrail.service.js when NV-00 is available.
export const checkInput = async ({ text }) => {
  const original = text.toLocaleLowerCase('vi-VN').normalize('NFC')
  const request = original.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
  const confirmation = /(?:danh dau|xac nhan|dat trang thai).*(?:da thanh toan|thanh toan thanh cong|paid)|(?:chuyen|cap nhat).*(?:sang|thanh|la)\s*(?:da thanh toan|thanh toan thanh cong|paid)/u.test(request)
  const matching = /(?<![\p{L}\p{N}])(?:gán|gan|ghép|ghep|đối\s+soát|doi\s+soat)(?![\p{L}\p{N}]).*?(?<![\p{L}\p{N}])(?:vào|vao|cho)\s+(?:đơn|don)(?![\p{L}\p{N}])/u.test(original)
  if (confirmation || matching) return { action: 'refuse', category: 'forbidden_action', message: 'Mình không thể xác nhận thanh toán hoặc gán giao dịch vào đơn. Bạn hãy mở trang Giao dịch để kiểm tra khi dữ liệu được kết nối.', signals: [] }
  return { action: 'allow', category: 'ok', message: '', signals: [] }
}
export const guardData = async (content) => ({ content: wrapUntrusted(content, 'du_lieu'), flagged: false, signals: [] })
export function assertToolAllowed(tool, { channel }) {
  if (channel !== 'owner' || (tool.tier !== 'read' && !(['write', 'sensitive'].includes(tool.tier) && typeof tool.propose === 'function'))) throw new HttpError(403, 'TOOL_NOT_ALLOWED', 'Công cụ không được phép.')
}
export const checkOutput = async ({ text }) => ({ text, redacted: false, signals: [] })
