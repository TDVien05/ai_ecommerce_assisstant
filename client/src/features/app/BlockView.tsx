import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AgentStep, AssistantText, Block as FlowyBlock, BlockHeader, BlockBody, BlockFooter, DataTable, ProactiveNotice, ResultCard, RiskAlert, ThreadSummary } from '@/components/flowy'
import { Button } from '@/components/ui/button'
import { realLedgerTemplatesApi } from '@/lib/ledgerTemplates'
import { exportExcel, exportPdf } from '@/features/ledgerTemplates/exportBook'
import { ai, type Block } from '@/lib/ai'
import { approve, run } from './actions'

/** Đổi một khối dữ liệu của AI thành component Flowy tương ứng. */
export function BlockView({ block, onOpenThread }: { block: Block; onOpenThread: (id: string) => void }) {
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
    case 'agentStep':
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
    case 'proactiveNotice':
      return (
        <ProactiveNotice
          headline={block.headline}
          detail={block.detail}
          risk={block.risk}
          actionLabel={block.actionLabel}
          onOpenThread={() => onOpenThread(block.threadId)}
          onDismiss={() => run(ai.dismissNotice(block.noticeId))}
        />
      )
  }
}
