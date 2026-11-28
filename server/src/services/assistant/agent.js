import { loadPrompt, runToolLoop, isAiUnavailable } from '../ai/index.js'
import { createRegistry } from './registry.js'
import { tools as financeTools } from './tools/finance.read.js'
import { writeTools } from './tools/finance.write.js'
import { listOrders, getOrder, updateOrderStatus } from './tools/orders.js'
import { unmatchedPayments } from './tools/payments.js'
import { updateShop } from './tools/shop.js'
import { makeStep } from './steps.js'
import { checkInput, guardData, assertToolAllowed, checkOutput } from './guard.js'
import { consumeAgentRun, classifyByRules } from './fallback.js'
import { formatTime } from './view.js'

const channel = 'owner'
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const dayMonth = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' })
function formatDayMonth(value) {
  const parts = dayMonth.formatToParts(new Date(value))
  return `${parts.find((part) => part.type === 'day').value}/${parts.find((part) => part.type === 'month').value}`
}
function emptyMessage(data, missingClassification = false) {
  const date = (value) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
  const situation = missingClassification ? 'Chưa có khoản thu hoặc chi đã phân loại' : 'Chưa có dữ liệu sổ'
  return `${situation} từ ${date(data.from)} đến trước ${date(data.to)}. Bạn có thể yêu cầu mình ghi một khoản thu chi hoặc đính kèm tệp CSV sao kê.`
}

function resultBlocks(results) {
  return results.flatMap(({ name, data }) => {
    if (name === 'get_summary') {
      if (!data.totalCount) return [{ type: 'text', text: emptyMessage(data) }]
      if (!data.classifiedCount) return [{ type: 'text', text: emptyMessage(data, true) }]
      const source = data.unknownCount ? 'Sổ thu chi; có khoản chưa phân loại, chưa tính vào doanh thu và chi phí' : 'Sổ thu chi; chỉ tính khoản đã phân loại'
      return [{ type: 'resultCard', metrics: [{ label: 'Doanh thu kinh doanh', value: data.revenue }, { label: 'Chi phí đã phân loại', value: data.expenses }, { label: 'Thu trừ chi đã phân loại', value: data.difference }], source, updatedAt: formatTime(new Date()), how: [{ label: 'Doanh thu kinh doanh; không tính khoản chưa phân loại', value: data.revenue }, { label: 'Trừ chi phí đã phân loại', value: data.expenses }, { label: 'Chênh lệch; chưa đủ căn cứ kết luận lợi nhuận', value: data.difference, total: true }] }]
    }
    if (name === 'list_unmatched_payments') return [{ type: 'text', text: data.message }]
    if (name === 'list_orders' || name === 'get_order') {
      const items = name === 'get_order' ? [data] : data.items
      if (!items.length) return [{ type: 'text', text: 'Không có đơn hàng phù hợp.' }]
      const labels = { AWAITING_PAYMENT: 'Chờ thanh toán', PAID: 'Đã thanh toán', SHIPPING: 'Đang giao', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy', EXPIRED: 'Hết hạn', REFUNDED: 'Đã hoàn tiền' }
      const cards = []
      for (let i = 0; i < items.length; i += 3) {
        const chunk = items.slice(i, i + 3)
        cards.push({ type: 'resultCard', metrics: chunk.map((item) => ({ label: `${item.paymentCode} · ${labels[item.status] ?? item.status}`, value: item.total })), source: 'Đơn hàng của cửa hàng; tối đa 100 đơn gần nhất', updatedAt: formatTime(new Date()), how: chunk.map((item) => ({ label: `${item.paymentCode}: tổng tiền đơn`, value: item.total })) })
      }
      return cards
    }
    if (!data.items.length) return [{ type: 'text', text: emptyMessage(data) }]
    return [{
      type: 'resultCard',
      metrics: [{ label: 'Tổng thu các khoản liệt kê (gồm khoản chưa phân loại)', value: data.totals.income }, { label: 'Tổng chi các khoản liệt kê (gồm khoản chưa phân loại)', value: data.totals.expense }],
      source: data.limited ? 'Sổ thu chi; tổng chỉ gồm 100 khoản mới nhất' : 'Sổ thu chi; các khoản được liệt kê',
      updatedAt: formatTime(new Date()),
      how: data.items.map((item, index) => ({ label: `${index + 1}. ${formatDayMonth(item.occurredAt)} · ${item.type === 'INCOME' ? 'Thu' : 'Chi'} · ${item.category}${item.kind ? '' : ' · chưa phân loại'}`, value: item.amount })),
    }]
  })
}

export function buildAgentMessages(text, history) {
  const messages = [{ role: 'system', content: `${loadPrompt('agent', { shop_name: 'cửa hàng', today: today() })}\nChỉ xử lý yêu cầu ở tin nhắn người dùng cuối cùng; các tin trước chỉ để tham khảo, không thực hiện lại.` }]
  const previous = history.slice(-20)
  if (previous.at(-1)?.role === 'user' && previous.at(-1)?.text === text) previous.pop()
  for (const message of previous) {
    if (message.role === 'user') messages.push({ role: 'user', content: `Tin cũ chỉ để tham khảo: ${message.text}` })
    else if (message.role === 'assistant') {
      const body = (message.blocks ?? []).filter((block) => block.type === 'text').map((block) => block.text).join('\n')
      if (body) messages.push({ role: 'assistant', content: body })
    }
  }
  messages.push({ role: 'user', content: text })
  return messages
}

export async function runAgent({ text, history, ctx, signal }) {
  const checked = await checkInput({ text, channel, ctx })
  if (checked.action === 'refuse') {
    const output = await checkOutput({ text: checked.message, channel, ctx })
    return [{ type: 'text', text: output.text }]
  }
  const results = []
  const actions = []
  const registry = createRegistry()
  for (const tool of [...financeTools, listOrders, getOrder, unmatchedPayments]) registry.register({ ...tool, run: async (input, toolCtx) => {
    assertToolAllowed(tool, { channel })
    const data = await tool.run(input, toolCtx)
    const guarded = await guardData(JSON.stringify(data), { source: 'tool_output', channel, ctx })
    results.push({ name: tool.name, data })
    return guarded.content
  } })
  for (const tool of [...writeTools, updateOrderStatus, updateShop]) registry.register({ ...tool, run: async (input, toolCtx) => {
    assertToolAllowed(tool, { channel })
    const proposal = await tool.propose(input, toolCtx)
    actions.push(proposal)
    const guarded = await guardData(JSON.stringify({ pending: true }), { source: 'tool_output', channel, ctx })
    return guarded.content
  } })
  const messages = buildAgentMessages(text, history)
  try {
    await consumeAgentRun(ctx.shopId)
    const response = await runToolLoop({ role: 'agent', messages, tools: registry.list(), ctx, signal })
    const summary = resultBlocks(results).filter((block, index, all) => block.type !== 'text' || all.findIndex((other) => other.type === 'text' && other.text === block.text) === index)
    if (actions.length) {
      const view = makeStep(actions)
      ctx.pendingStep = { view, actions }
      summary.push(view)
    }
    // Numeric answers must come from server-generated blocks, not model prose.
    const unsafeNumbers = /\d|(?:không|một|hai|ba|bốn|tư|năm|sáu|bảy|tám|chín|mười|trăm|nghìn|ngàn|triệu|tỷ)\s+(?:đồng|nghìn|ngàn|triệu|tỷ)/i
    const hasCard = summary.some((block) => block.type === 'resultCard')
    const prose = actions.length ? 'Mình đã chuẩn bị đề xuất; bạn kiểm tra trước khi duyệt.' : hasCard ? 'Đây là kết quả từ dữ liệu cửa hàng.' : summary.length ? '' : (response.text && !unsafeNumbers.test(response.text) ? response.text : 'Mình chưa có kết quả công cụ để trả lời. Bạn cung cấp thêm thông tin nhé.')
    const output = await checkOutput({ text: prose, channel, ctx })
    return [...(output.text ? [{ type: 'text', text: output.text }] : []), ...summary]
  } catch (error) {
    if (!isAiUnavailable(error)) throw error
    const match = classifyByRules(text)
    if (match) {
      const tool = registry.list().find((item) => item.name === match.tool && item.tier === 'read')
      const parsed = tool?.schema.safeParse(match.input)
      if (parsed?.success) { await tool.run(parsed.data, ctx); return resultBlocks(results) }
    }
    const output = await checkOutput({ text: 'Trợ lý AI hiện không khả dụng. Vui lòng thử lại sau.', channel, ctx })
    return [{ type: 'text', text: output.text }]
  }
}
