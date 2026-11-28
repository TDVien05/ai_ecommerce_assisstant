import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AgentStep, AssistantText, Block as FlowyBlock, BlockHeader, BlockBody, BlockFooter, DataTable, ProactiveNotice, ResultCard, RiskAlert, ThreadSummary } from '@/components/flowy'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { realLedgerTemplatesApi } from '@/lib/ledgerTemplates'
import { exportExcel, exportPdf } from '@/features/ledgerTemplates/exportBook'
import { ai, type Block } from '@/lib/ai'
import { approve, run } from './actions'

type BankSettings = { bankCode: string | null; bankAccountNumber: string | null; bankAccountName: string | null }
type SensitiveDetails = { before: BankSettings; after: BankSettings }

function LegalNotice() {
  return <FlowyBlock><BlockBody><p>Số liệu chỉ gồm doanh thu đã ghi trong sổ và không đủ để xác định doanh thu của toàn hộ.</p><p>Nếu thuộc trường hợp quy định và doanh thu lũy kế vượt ngưỡng, thời hạn đăng ký hóa đơn điện tử có thể được tính từ cuối kỳ tính thuế. Hãy liên hệ cơ quan thuế để xác định nghĩa vụ và thời hạn áp dụng.</p><a className="underline underline-offset-4" href="https://congbaocdn.chinhphu.vn/180507251028987904/2026/5/14/469455-1778231931_v1_1778720623_signed.pdf" target="_blank" rel="noreferrer">Khoản 2 Điều 1 Nghị định 141/2026/NĐ-CP · Công báo</a></BlockBody></FlowyBlock>
}

function pageUrl({ page, filters }: Pick<Extract<Block, { type: 'pageLink' }>, 'page' | 'filters'>) {
  if (!['ledger', 'orders', 'reports', 'fraud', 'messenger', 'sources', 'settings'].includes(page)) return null
  const query = new URLSearchParams(filters).toString()
  return `/pages/${page}${query ? `?${query}` : ''}`
}

function SensitiveStep({ block }: { block: Extract<Block, { type: 'agentStep' }> }) {
  const [details, setDetails] = useState<SensitiveDetails | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (block.state !== 'waiting') { setDetails(null); return }
    let active = true
    api.get<SensitiveDetails>(`/assistant/steps/${encodeURIComponent(block.stepId)}/sensitive`).then((value) => { if (active) setDetails(value) }).catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'Không tải được thông tin tài khoản.') })
    return () => { active = false }
  }, [block.state, block.stepId])
  async function submit(action: 'approve' | 'undo') {
    if (busy || !password || (action === 'approve' && !details)) return
    setBusy(true); setError('')
    try {
      if (action === 'approve') await ai.approve(block.stepId, password)
      else await ai.undo(block.stepId, password)
      setPassword('')
    } catch (err) { setPassword(''); setError(err instanceof Error ? err.message : 'Không thực hiện được thay đổi.') } finally { setBusy(false) }
  }
  const account = (value: BankSettings) => `${value.bankCode ?? '—'} · ${value.bankAccountNumber ?? '—'} · ${value.bankAccountName ?? '—'}`
  const extra = (block.state === 'waiting' || block.state === 'done') ? <div className="mt-3 flex flex-col gap-2 border border-border p-3">
    {block.state === 'waiting' && <><p>Thay đổi tài khoản nhận tiền. Kiểm tra kỹ trước khi duyệt.</p>{details ? <><p>Cũ: {account(details.before)}</p><p>Mới: {account(details.after)}</p></> : <p>Đang tải thông tin tài khoản…</p>}</>}
    <label htmlFor={`password-${block.stepId}`}>Nhập lại mật khẩu để {block.state === 'waiting' ? 'duyệt' : 'hoàn tác'}</label>
    <Input id={`password-${block.stepId}`} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
    {error && <p role="alert">{error}</p>}
  </div> : undefined
  return <AgentStep title={block.title} state={block.state} steps={block.steps} questions={block.questions} approveLabel={block.approveLabel} onApprove={() => void submit('approve')} onUndo={() => void submit('undo')} undoNote={block.undoNote} doneText={block.doneText} extra={extra} />
}

function MessageDraftStep({ block }: { block: Extract<Block, { type: 'agentStep' }> }) {
  const [recipients,setRecipients] = useState<{id:string;name:string}[]>([])
  const [selected,setSelected] = useState(block.messageDraft?.conversationId ?? '')
  const [text,setText] = useState(block.messageDraft?.text ?? '')
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  useEffect(() => {
    let active=true
    api.get<{items:{id:string;name:string}[]}>('/assistant/message-recipients').then((value)=>{if(active)setRecipients(value.items)}).catch((err:unknown)=>{if(active)setError(err instanceof Error ? err.message : 'Không tải được hội thoại.')})
    return ()=>{active=false}
  },[])
  async function send() {
    if (busy || !selected || !text.trim()) { setError('Chọn hội thoại và nhập nội dung trước khi duyệt.'); return }
    setBusy(true);setError('')
    try {
      await api.post(`/assistant/steps/${encodeURIComponent(block.stepId)}/message-draft`,{conversationId:selected,text:text.trim()})
      await ai.approve(block.stepId)
    } catch(err) { setError(err instanceof Error ? err.message : 'Chưa gửi được tin nhắn.') } finally { setBusy(false) }
  }
  const extra=block.state==='waiting' ? <div className="mt-3 flex flex-col gap-2 border border-border p-3">
    <label htmlFor={`recipient-${block.stepId}`}>Người nhận</label>
    <select id={`recipient-${block.stepId}`} className="h-9 rounded-sm border border-input bg-background px-3 text-sm" value={selected} onChange={(event)=>setSelected(event.target.value)}>
      <option value="">Chọn hội thoại</option>{recipients.map((item)=><option key={item.id} value={item.id}>{item.name} · {item.id.slice(0,8)}</option>)}
    </select>
    <label htmlFor={`message-${block.stepId}`}>Nội dung tin nhắn</label>
    <textarea id={`message-${block.stepId}`} className="min-h-24 rounded-sm border border-input bg-background p-3 text-sm" maxLength={2000} value={text} onChange={(event)=>setText(event.target.value)} />
    <p>Tin đã gửi không thể hoàn tác. Chỉ gửi khi bạn duyệt.</p>{error && <p role="alert">{error}</p>}
  </div> : undefined
  return <AgentStep title={block.title} state={block.state} steps={block.steps} approveLabel={block.approveLabel} onApprove={()=>void send()} canUndo={false} extra={extra} doneText={block.doneText} />
}

/** Đổi một khối dữ liệu của AI thành component Flowy tương ứng. */
export function BlockView({ block, onOpenThread }: { block: Block; onOpenThread: (id: string) => void }) {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function download(format: 'pdf' | 'xlsx') {
    if (block.type !== 'ledgerExport') return
    setBusy(true); setError('')
    try {
      const book = await realLedgerTemplatesApi.book(block.code, block.from, block.to)
      const date = (value: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value))
      const identity = { name: book.shopName ?? '', taxId: '', address: '', location: '', periodLabel: `${date(block.from)} đến trước ${date(block.to)}` }
      if (format === 'pdf') await exportPdf(book, identity, [], `${block.code}.pdf`)
      else await exportExcel(book, identity, [], `${block.code}.xlsx`)
    } catch { setError('Không tải được mẫu sổ. Bạn thử lại nhé.') } finally { setBusy(false) }
  }
  switch (block.type) {
    case 'text':
      return <AssistantText text={block.text} />
    case 'pageLink': {
      const to = pageUrl(block)
      return to ? <Button variant="outline" render={<Link to={to} />}>{block.label}</Button> : null
    }
    case 'legalNotice':
      return <LegalNotice />
    case 'agentStep':
      if (block.requiresPassword) return <SensitiveStep block={block} />
      if (block.messageDraft) return <MessageDraftStep block={block} />
      return (
        <AgentStep
          title={block.title}
          state={block.state}
          steps={block.steps}
          questions={block.questions}
          onAnswer={(questionId, option) => run(ai.answer({ stepId: block.stepId, questionId, option }))}
          approveLabel={block.approveLabel}
          onApprove={() => approve(block.stepId)}
          onUndo={() => run(ai.undo(block.stepId))}
          undoNote={block.undoNote}
          doneText={block.doneText}
        />
      )
    case 'resultCard':
      return <ResultCard metrics={block.metrics} source={block.source} updatedAt={block.updatedAt} how={block.how} />
    case 'dataTable':
      return <DataTable columns={block.columns} rows={block.rows} source={block.source} updatedAt={block.updatedAt} how={block.how} />
    case 'ledgerExport':
      return <FlowyBlock><BlockHeader><b>{block.code} · {block.name}</b></BlockHeader><BlockBody><p>Kỳ: {new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(block.from))} đến trước {new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(block.to))}</p>{block.warnings.map((warning) => <p className="text-xs text-muted-foreground" key={warning}>{warning}</p>)}{error && <p role="alert">{error}</p>}</BlockBody><BlockFooter><Button disabled={busy} onClick={() => download('pdf')}>Tải PDF</Button><Button variant="outline" disabled={busy} onClick={() => download('xlsx')}>Tải Excel</Button><Button variant="ghost" onClick={() => localStorage.setItem('flowy-ledger-template', block.code)} render={<Link to="/pages/ledger?tab=templates" />}>Mở trang Mẫu sổ</Button></BlockFooter></FlowyBlock>
    case 'riskAlert':
      return (
        <RiskAlert
          title={block.title}
          level={block.level}
          reasons={block.reasons}
          safeActionLabel={block.safeActionLabel}
          onSafeAction={() => run(ai.safeAction(block.alertId))}
          detectedNote={block.detectedNote}
        />
      )
    case 'threadSummary':
      return (
        <ThreadSummary
          title={block.title}
          status={block.status}
          updatedAt={block.updatedAt}
          summary={block.summary}
          onOpen={() => onOpenThread(block.threadId)}
        />
      )
    case 'proactiveNotice': {
      const target = block.target && pageUrl(block.target)
      return (
        <ProactiveNotice
          headline={block.headline}
          detail={block.detail}
          risk={block.risk}
          actionLabel={block.actionLabel}
          onOpenThread={() => {
            if (target) navigate(target)
            else if (block.threadId) onOpenThread(block.threadId)
          }}
          onDismiss={() => run(block.target ? ai.dismissProactive(block.noticeId) : ai.dismissNotice(block.noticeId))}
        >
          {block.target && block.wording && <p>{block.wording}</p>}
          {block.target && block.result && <ResultCard {...block.result} />}
          {block.target && block.legal && <LegalNotice />}
        </ProactiveNotice>
      )
    }
  }
}
