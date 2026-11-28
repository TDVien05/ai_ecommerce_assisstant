import { wrapUntrusted } from '../ai/index.js'
import { HttpError } from '../../lib/httpError.js'

// Temporary adapter; replace with guardrail.service.js when NV-00 is available.
export const checkInput = async ({ text }) => {
  const request = text.toLocaleLowerCase('vi-VN')
  const confirmation = /(?:đánh dấu|xác nhận|đặt).*(?:đã thanh toán|thanh toán thành công|paid)|(?:chuyển|cập nhật).*(?:sang|thành|là)\s*(?:đã thanh toán|thanh toán thành công|paid)/u.test(request)
  const matching = /(?:gán|ghép|đối soát).*(?:giao dịch|đơn hàng|đơn)/u.test(request)
  if (confirmation || matching) return { action: 'refuse', category: 'forbidden_action', message: 'Mình không thể xác nhận thanh toán hoặc gán giao dịch vào đơn. Bạn hãy mở trang Giao dịch để kiểm tra khi dữ liệu được kết nối.', signals: [] }
  return { action: 'allow', category: 'ok', message: '', signals: [] }
}
export const guardData = async (content) => ({ content: wrapUntrusted(content, 'du_lieu'), flagged: false, signals: [] })
export function assertToolAllowed(tool, { channel }) {
  if (channel !== 'owner' || (tool.tier !== 'read' && !(['write', 'sensitive'].includes(tool.tier) && typeof tool.propose === 'function'))) throw new HttpError(403, 'TOOL_NOT_ALLOWED', 'Công cụ không được phép.')
}
export const checkOutput = async ({ text }) => ({ text, redacted: false, signals: [] })
