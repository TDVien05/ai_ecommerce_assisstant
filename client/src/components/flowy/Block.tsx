import { cn } from '@/lib/utils'

/**
 * Khung chung của mọi khối AI trong chat (AgentStep, ThreadSummary, ProactiveNotice, RiskAlert).
 * Vuông góc, viền 1px, không bóng. tone="attention" = viền đậm cho khối cần người dùng.
 */
export function Block({
  tone = 'default',
  className,
  ...props
}: React.ComponentProps<'div'> & { tone?: 'default' | 'attention' | 'danger' }) {
  return (
    <div
      className={cn(
        'border bg-card text-card-foreground',
        tone === 'attention' && 'border-foreground',
        tone === 'danger' && 'border-risk-high',
        className,
      )}
      {...props}
    />
  )
}

export function BlockHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex items-center gap-2 border-b px-3.5 py-2.5', className)} {...props} />
}

export function BlockTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('min-w-0 flex-1 font-semibold', className)} {...props} />
}

export function BlockBody({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-2.5 px-3.5 py-3', className)} {...props} />
}

export function BlockFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-wrap items-center gap-2 border-t px-3.5 py-2.5', className)} {...props} />
}
