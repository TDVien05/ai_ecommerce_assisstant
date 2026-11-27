import { AgentStep, ProactiveNotice, ResultCard, RiskAlert, ThreadSummary } from '@/components/flowy'
import { ai, type Block } from '@/lib/ai'
import { approve, run } from './actions'

/** Đổi một khối dữ liệu của AI thành component Flowy tương ứng. */
export function BlockView({ block, onOpenThread }: { block: Block; onOpenThread: (id: string) => void }) {
  switch (block.type) {
    case 'text':
      return <p>{block.text}</p>
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
