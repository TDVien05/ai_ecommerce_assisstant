import { loadPrompt, runToolLoop, isAiUnavailable } from '../ai/index.js'
import { createRegistry } from './registry.js'
import { tools as financeTools } from './tools/finance.read.js'
import { listOrders, getOrder } from './tools/orders.js'
import { exportBook, ledgerBook } from './tools/books.js'
import { reportTool } from './tools/report.js'
import { pageTool } from './tools/page.js'
import { statementTool } from './tools/statement.js'
import { queryTool } from './tools/query.js'
import { proposeChange } from './tools/change.js'
import { changeToolByName } from './tools/change.js'
import { makeStep } from './steps.js'
import { checkInput, guardData, assertToolAllowed, checkOutput } from './guard.js'
import { classifyByRules, RULE_MODE_HELP } from './fallback.js'
import { formatTime } from './view.js'
import { appError } from '../../errors/index.js'

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
  return `${situation} từ ${date(data.from)} đến trước ${date(data.to)}. Bạn có thể yêu cầu mình ghi một khoản thu chi hoặc đính kèm tệp CSV sao kê (hoặc XLSX).`
}

function resultBlocks(results) {
  return results.flatMap(({ name, data }) => {
    if(name==='statement') {
      if(data.action==='history') {
        const columns=[{key:'name',label:'Tệp',kind:'text'},{key:'fileId',label:'Mã tệp',kind:'text'},{key:'stepId',label:'Mã lần nhập',kind:'text'},{key:'state',label:'Trạng thái',kind:'text'},{key:'created',label:'Thời điểm',kind:'date'}]
        const states={waiting:'Chờ duyệt',done:'Đã nhập',undone:'Đã hoàn tác',failed:'Lỗi',working:'Đang xử lý'}
        const imported=data.imports.map((item)=>[item.name,item.fileId,item.stepId,states[item.state]??item.state,item.createdAt])
        const used=new Set(data.imports.map((item)=>item.fileId))
        const uploaded=data.files.filter((file)=>!used.has(file.id)).map((file)=>[file.name,file.id,null,'Chưa có lần nhập',file.createdAt])
        return imported.length||uploaded.length?[{type:'dataTable',columns,rows:[...imported,...uploaded],source:'Lịch sử sao kê của cửa hàng',updatedAt:formatTime(new Date()),how:'Tối đa 100 tệp và 100 lần nhập gần nhất.'}]:[{type:'text',text:'Chưa có tệp sao kê.'}]
      }
      return [...data.warnings.map((warning)=>({type:'text',text:warning})),{type:'dataTable',columns:data.columns,rows:data.rows,source:data.source,updatedAt:formatTime(new Date()),how:data.how}]
    }
    if (name === 'open_page') return [{type:'pageLink',page:data.page,label:data.label,filters:data.filters}]
    if (name === 'get_report') {
      const blocks=[]
      for(const [label,report] of [['Kỳ đã chọn',data.current],['Kỳ so sánh',data.previous]]) {
        if(!report)continue
        if(!report.totalCount) {blocks.push({type:'text',text:`${label}: chưa có dữ liệu thu chi.`});continue}
        if(!report.classifiedCount) blocks.push({type:'text',text:`${label}: chưa có khoản doanh thu hoặc chi phí kinh doanh được phân loại.`})
        const showDate=(value)=>new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value))
        const updatedAt=formatTime(new Date(report.updatedAt)),source=`${label} (${showDate(report.from)} đến trước ${showDate(report.to)}) · sổ thu chi và đơn hàng`
        blocks.push({type:'resultCard',metrics:[{label:'Doanh thu đã phân loại',value:report.revenue},{label:'Chi phí đã phân loại',value:report.expenses},...(report.netProfit===null?[]:[{label:'Lãi tạm tính',value:report.netProfit}])],source,updatedAt,how:[{label:'Doanh thu đã phân loại',value:report.revenue},...(report.cost===null?[]:[{label:'Trừ giá vốn',value:report.cost}]),{label:'Trừ chi phí đã phân loại',value:report.expenses},...(report.netProfit===null?[]:[{label:'Lãi tạm tính',value:report.netProfit,total:true}])]})
        blocks.push({type:'resultCard',metrics:[{label:'Tiền vào',value:report.cashIn},{label:'Tiền ra',value:report.cashOut}],source:`${label} · sổ thu chi, gồm cả khoản cá nhân`,updatedAt,how:[{label:'Tổng khoản thu',value:report.cashIn},{label:'Tổng khoản chi',value:report.cashOut}]})
        if(report.unknownCount || report.missingCostCount) blocks.push({type:'text',text:`${label}: báo cáo từng phần; ${report.unknownCount} khoản chưa phân loại hoặc phân loại không hợp lệ, ${report.missingCostCount} khoản doanh thu thiếu giá vốn hoặc cần xác minh giá vốn bằng 0. Chưa đủ dữ liệu để tính lãi.`})
      }
      if(data.difference && data.current.totalCount && data.previous.totalCount) blocks.push({type:'resultCard',metrics:[{label:'Chênh lệch doanh thu',value:data.difference.revenue},{label:'Chênh lệch chi phí',value:data.difference.expenses},...(data.difference.netProfit===null?[]:[{label:'Chênh lệch lãi',value:data.difference.netProfit}])],source:'Kỳ đã chọn trừ kỳ so sánh · sổ thu chi và đơn hàng',updatedAt:formatTime(new Date()),how:[{label:'Doanh thu kỳ đã chọn',value:data.current.revenue},{label:'Trừ doanh thu kỳ so sánh',value:data.previous.revenue},{label:'Chênh lệch doanh thu',value:data.difference.revenue,total:true},{label:'Chi phí kỳ đã chọn',value:data.current.expenses},{label:'Trừ chi phí kỳ so sánh',value:data.previous.expenses},{label:'Chênh lệch chi phí',value:data.difference.expenses,total:true},...(data.difference.netProfit===null?[]:[{label:'Lãi kỳ đã chọn',value:data.current.netProfit},{label:'Trừ lãi kỳ so sánh',value:data.previous.netProfit},{label:'Chênh lệch lãi',value:data.difference.netProfit,total:true}])]})
      return blocks
    }
    if (name === 'ledger_book') {
      if(data.action==='preview')return [{type:'ledgerExport',code:data.code,name:data.name,from:data.from,to:data.to,warnings:data.warnings}]
      if(data.action==='list'||data.action==='suggest')return [{type:'text',text:`${data.action==='suggest'?'Bạn có thể xem trước S1a-HKD và tham khảo các mẫu dưới đây; hãy đối chiếu với cơ quan thuế.':'Các mẫu sổ:'}\n${data.items.map((item)=>`${item.code} · ${item.name}`).join('\n')}`},{type:'pageLink',page:'ledger',label:'Mở trang Mẫu sổ',filters:{tab:'templates'}}]
      if(data.action==='identity')return [{type:'text',text:`Tên cửa hàng: ${data.name || 'chưa có'}. ${data.note}`}]
      if(data.action==='columns')return [{type:'text',text:data.note},{type:'pageLink',page:'ledger',label:'Mở trang Mẫu sổ',filters:{tab:'templates',code:data.code,...(data.column?{column:data.column}:{})}}]
      if(data.action==='threshold')return [{type:'resultCard',metrics:[{label:`Doanh thu kinh doanh năm ${data.year}`,value:data.revenue}],source:data.source,updatedAt:formatTime(new Date(data.updatedAt)),how:[{label:'Doanh thu kinh doanh đã ghi trong năm',value:data.revenue,total:true}]},...(data.unknownCount?[{type:'text',text:`Có ${data.unknownCount} khoản chưa phân loại hoặc phân loại không hợp lệ; chưa tính vào doanh thu.`}]:[]),{type:'legalNotice'}]
    }
    if (name === 'query_data') return data.rows.length ? [{ type: 'dataTable', columns: data.columns, rows: data.rows, source: data.source, updatedAt: formatTime(new Date()), how: `Dữ liệu của cửa hàng theo điều kiện đã chọn; tối đa ${data.limit} dòng${data.grouped ? ', có nhóm và tổng hợp' : ''}.${data.metrics.some((key) => key.startsWith('avg_')) ? ' Giá trị trung bình làm tròn đến đơn vị gần nhất.' : ''}` }] : [{ type: 'text', text: 'Không có dữ liệu phù hợp với điều kiện đã chọn.' }]
    if (name === 'export_ledger_book') return [{ type: 'ledgerExport', code: data.code, name: data.name, from: data.from, to: data.to, warnings: data.warnings }]
    if (name === 'get_activity') {
      const source = 'Sổ thu chi và đơn tạo trong kỳ', updatedAt = formatTime(new Date())
      const card = (label, item) => ({ type: 'resultCard', metrics: [{ label: `Số ${label}`, value: item.count, unit: 'count' }, { label: `Tổng ${label}`, value: item.amount }], source, updatedAt, how: [{ label: `Số ${label}`, value: item.count, unit: 'count' }, { label: `Tổng ${label}`, value: item.amount }] })
      const labels = { AWAITING_PAYMENT: 'đơn chờ thanh toán', PAID: 'đơn đã thanh toán', SHIPPING: 'đơn đang giao', COMPLETED: 'đơn hoàn tất', CANCELLED: 'đơn đã hủy', EXPIRED: 'đơn hết hạn', REFUNDED: 'đơn hoàn tiền' }
      return [card('khoản thu', data.income), card('khoản chi', data.expense), card('đơn hàng', data.orderTotal), ...data.orders.map((item) => card(labels[item.status] ?? `đơn ${item.status}`, item)), { type: 'text', text: 'Giao dịch ngân hàng chưa gắn đơn hiện chưa xem được.' }]
    }
    if (name === 'get_summary') {
      if (!data.totalCount) return [{ type: 'text', text: emptyMessage(data) }]
      if (!data.classifiedCount) return [{ type: 'text', text: emptyMessage(data, true) }]
      const source = data.unknownCount ? 'Sổ thu chi; có khoản chưa phân loại, chưa tính vào doanh thu và chi phí' : 'Sổ thu chi; chỉ tính khoản đã phân loại'
      return [{ type: 'resultCard', metrics: [{ label: 'Doanh thu kinh doanh', value: data.revenue }, { label: 'Chi phí đã phân loại', value: data.expenses }, { label: 'Thu trừ chi đã phân loại', value: data.difference }], source, updatedAt: formatTime(new Date()), how: [{ label: 'Doanh thu kinh doanh; không tính khoản chưa phân loại', value: data.revenue }, { label: 'Trừ chi phí đã phân loại', value: data.expenses }, { label: 'Chênh lệch; chưa đủ căn cứ kết luận lợi nhuận', value: data.difference, total: true }] }]
    }
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
  ctx.ownerText = text
  const checked = await checkInput({ text, channel, ctx })
  if (checked.action === 'refuse') {
    const output = await checkOutput({ text: checked.message, channel, ctx })
    return [{ type: 'text', text: output.text }]
  }
  const results = []
  const actions = []
  let statementPending=false
  const registry = createRegistry()
  for (const tool of [...financeTools, listOrders, getOrder, exportBook, ledgerBook, reportTool, pageTool, queryTool]) registry.register({ ...tool, run: async (input, toolCtx) => {
    assertToolAllowed(tool, { channel })
    const data = await tool.run(input, toolCtx)
    const modelData = tool.name === 'query_data' ? { ...data, rows: data.modelRows, modelRows: undefined } : data
    const guarded = await guardData(JSON.stringify(modelData), { source: 'tool_output', channel, ctx })
    results.push({ name: tool.name, data })
    return guarded.content
  } })
  for (const tool of [proposeChange]) registry.register({ ...tool, run: async (input, toolCtx) => {
    assertToolAllowed(tool, { channel })
    if(statementPending)throw appError('BAD_REQUEST','Sao kê phải được duyệt riêng.')
    const proposal = await tool.propose(input, toolCtx)
    if (actions.length + proposal.length > 20) throw appError('BAD_REQUEST', 'Quá nhiều thay đổi trong một đề xuất.')
    if ([...actions,...proposal].some((action)=>changeToolByName.get(action.tool)?.requiresPassword || changeToolByName.get(action.tool)?.standalone) && (actions.length + proposal.length !== 1)) throw appError('BAD_REQUEST', 'Thao tác này phải được duyệt riêng.')
    actions.push(...proposal)
    const guarded = await guardData(JSON.stringify({ pending: true }), { source: 'tool_output', channel, ctx })
    return guarded.content
  } })
  registry.register({...statementTool,run:async(input,toolCtx)=>{
    assertToolAllowed(statementTool,{channel})
    if(input.action==='import' || input.action==='undo') {
      if(actions.length || statementPending)throw appError('BAD_REQUEST','Sao kê phải được duyệt riêng.')
      actions.push(...await statementTool.propose(input,toolCtx));statementPending=true
      return (await guardData(JSON.stringify({pending:true}),{source:'tool_output',channel,ctx})).content
    }
    const data=await statementTool.run(input,toolCtx)
    const modelData=data.rows?{...data,rows:data.modelRows,modelRows:undefined}:data
    results.push({name:'statement',data})
    return (await guardData(JSON.stringify(modelData),{source:'tool_output',channel,ctx})).content
  }})
  const messages = buildAgentMessages(text, history)
  try {
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
    const prose = actions.length ? 'Mình đã chuẩn bị đề xuất; bạn kiểm tra trước khi duyệt.' : hasCard ? 'Đây là kết quả từ dữ liệu cửa hàng.' : summary.length ? '' : (response.text && !unsafeNumbers.test(response.text) ? response.text : 'Mình có thể tra thu chi, xem đơn và chuẩn bị mẫu sổ. Bạn thử hỏi: “Hôm nay có bao nhiêu giao dịch?”, “Chi hôm nay gồm những gì?” hoặc “Xuất mẫu sổ tháng này”.')
    const output = await checkOutput({ text: prose, channel, ctx })
    return [...(output.text ? [{ type: 'text', text: output.text }] : []), ...summary]
  } catch (error) {
    if (!isAiUnavailable(error)) throw error
    const match = classifyByRules(text)
    if (match) {
      const tool = registry.list().find((item) => item.name === match.tool && item.tier === 'read')
      const parsed = tool?.schema.safeParse(match.input)
      if (parsed?.success) {
        try { await tool.run(parsed.data, ctx) } catch (toolError) {
          // A client error (e.g. unknown order code) is answered in chat; anything else is a real failure.
          if (!(toolError?.status >= 400 && toolError.status < 500)) throw toolError
          const output = await checkOutput({ text: toolError.message, channel, ctx })
          return [{ type: 'text', text: output.text }]
        }
        const note = await checkOutput({ text: 'Trợ lý AI đang tạm ngưng; kết quả dưới đây lấy theo chế độ cơ bản.', channel, ctx })
        return [{ type: 'text', text: note.text }, ...resultBlocks(results)]
      }
    }
    const output = await checkOutput({ text: RULE_MODE_HELP, channel, ctx })
    return [{ type: 'text', text: output.text }]
  }
}
