import { loadPrompt, runToolLoop, isAiUnavailable } from '../ai/index.js'
import { createRegistry } from './registry.js'
import { tools as financeTools } from './tools/finance.read.js'
import { writeTools } from './tools/finance.write.js'
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

function resultBlocks(results) {
  return results.flatMap(({ name, data }) => {
    if (name === 'get_summary') {
      if (!data.totalCount) return [{ type: 'text', text: 'Chưa có dữ liệu sổ trong kỳ này.' }]
      if (!data.classifiedCount) return [{ type: 'text', text: 'Chưa có khoản thu hoặc chi đã phân loại trong kỳ; không thể kết luận doanh thu hay chi phí.' }]
      const source = data.unknownCount ? 'Sổ thu chi; có khoản chưa phân loại, chưa tính vào doanh thu và chi phí' : 'Sổ thu chi; chỉ tính khoản đã phân loại'
      return [{ type: 'resultCard', metrics: [{ label: 'Doanh thu kinh doanh', value: data.revenue }, { label: 'Chi phí đã phân loại', value: data.expenses }, { label: 'Thu trừ chi đã phân loại', value: data.difference }], source, updatedAt: formatTime(new Date()), how: [{ label: 'Doanh thu kinh doanh; không tính khoản chưa phân loại', value: data.revenue }, { label: 'Trừ chi phí đã phân loại', value: data.expenses }, { label: 'Chênh lệch; chưa đủ căn cứ kết luận lợi nhuận', value: data.difference, total: true }] }]
    }
    if (!data.items.length) return [{ type: 'text', text: 'Chưa có khoản sổ trong kỳ này.' }]
    return [{
      type: 'resultCard',
      metrics: [{ label: 'Tổng thu các khoản liệt kê (gồm khoản chưa phân loại)', value: data.totals.income }, { label: 'Tổng chi các khoản liệt kê (gồm khoản chưa phân loại)', value: data.totals.expense }],
      source: data.limited ? 'Sổ thu chi; tổng chỉ gồm 100 khoản mới nhất' : 'Sổ thu chi; các khoản được liệt kê',
      updatedAt: formatTime(new Date()),
      how: data.items.map((item, index) => ({ label: `${index + 1}. ${formatDayMonth(item.occurredAt)} · ${item.type === 'INCOME' ? 'Thu' : 'Chi'} · ${item.category}${item.kind ? '' : ' · chưa phân loại'}`, value: item.amount })),
    }]
  })
}

export async function runAgent({ text, history, ctx }) {
  const checked = await checkInput({ text, channel, ctx })
  if (checked.action === 'refuse') {
    const output = await checkOutput({ text: checked.message, channel, ctx })
    return [{ type: 'text', text: output.text }]
  }
  const results = []
  const actions = []
  const registry = createRegistry()
  for (const tool of financeTools) registry.register({ ...tool, run: async (input, toolCtx) => {
    assertToolAllowed(tool, { channel })
    const data = await tool.run(input, toolCtx)
    const guarded = await guardData(JSON.stringify(data), { source: 'tool_output', channel, ctx })
    results.push({ name: tool.name, data })
    return guarded.content
  } })
  for (const tool of writeTools) registry.register({ ...tool, run: async (input, toolCtx) => {
    assertToolAllowed(tool, { channel })
    const proposal = await tool.propose(input, toolCtx)
    actions.push(proposal)
    const guarded = await guardData(JSON.stringify({ pending: true }), { source: 'tool_output', channel, ctx })
    return guarded.content
  } })
  const messages = [{ role: 'system', content: loadPrompt('agent', { shop_name: 'cửa hàng', today: today() }) }]
  for (const message of history.slice(-20)) {
    if (message.role === 'user') messages.push({ role: 'user', content: message.text })
    else if (message.role === 'assistant') {
      const body = (message.blocks ?? []).filter((block) => block.type === 'text').map((block) => block.text).join('\n')
      if (body) messages.push({ role: 'assistant', content: body })
    }
  }
  try {
    await consumeAgentRun(ctx.shopId)
    const response = await runToolLoop({ role: 'agent', messages, tools: registry.list(), ctx })
    const summary = resultBlocks(results)
    if (actions.length) {
      const view = makeStep(actions)
      ctx.pendingStep = { view, actions }
      summary.push(view)
    }
    // Numeric answers must come from server-generated blocks, not model prose.
    const unsafeNumbers = /\d|(?:không|một|hai|ba|bốn|tư|năm|sáu|bảy|tám|chín|mười|trăm|nghìn|ngàn|triệu|tỷ)\s+(?:đồng|nghìn|ngàn|triệu|tỷ)/i
    const prose = actions.length ? 'Tôi đã chuẩn bị đề xuất; vui lòng kiểm tra trước khi duyệt.' : summary.length ? 'Đây là kết quả từ dữ liệu cửa hàng.' : (response.text && !unsafeNumbers.test(response.text) ? response.text : 'Tôi chưa có kết quả công cụ để trả lời. Vui lòng cung cấp thêm thông tin.')
    const output = await checkOutput({ text: prose, channel, ctx })
    return [{ type: 'text', text: output.text }, ...summary]
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
