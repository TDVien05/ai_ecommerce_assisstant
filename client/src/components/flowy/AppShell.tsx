import type { LucideIcon } from 'lucide-react'
import { MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ThreadList, type ThreadItem } from './ThreadList'

export type FeatureNavItem = { id: string; label: string; icon: LucideIcon }

type AppShellProps = {
  shopName: string
  /** Số việc đang chờ người dùng ở Chat trung tâm. */
  hubPending?: number
  threads: ThreadItem[]
  features: FeatureNavItem[]
  /** "hub", id của một luồng, hoặc id của một trang chức năng. */
  activeId: string
  onNavigate: (id: string) => void
  /** Nội dung thanh trên (tiêu đề, đường dẫn, nút ghost). */
  topbar: React.ReactNode
  children: React.ReactNode
  className?: string
}

/**
 * Khung ứng dụng: sidebar trái (Chat trung tâm, Luồng việc, Chức năng) và vùng chính.
 * Mở app luôn vào Chat trung tâm (activeId="hub").
 */
export function AppShell(props: AppShellProps) {
  const { shopName, hubPending = 0, threads, features, activeId, onNavigate } = props
  return (
    <div
      className={cn(
        'grid h-dvh grid-cols-1 bg-background text-foreground md:grid-cols-[232px_minmax(0,1fr)]',
        props.className,
      )}
    >
      <aside className="flex min-h-0 flex-col border-b bg-sidebar text-sidebar-foreground md:border-r md:border-b-0 md:border-sidebar-border">
        <div className="flex items-center gap-2 px-3 pt-3 pb-2 font-bold tracking-tight">
          <span className="grid size-[22px] place-items-center bg-primary text-xs text-primary-foreground">F</span>
          Flowy
        </div>
        <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-2">
          <div className="px-2 py-1">
            <NavButton active={activeId === 'hub'} onClick={() => onNavigate('hub')} icon={MessageSquare}>
              Chat trung tâm
              {hubPending > 0 && (
                <span className="ml-auto grid h-[18px] min-w-[18px] place-items-center rounded-sm bg-risk-high px-1 text-[11px] font-semibold text-primary-foreground">
                  {hubPending}
                </span>
              )}
            </NavButton>
          </div>
          <SidebarGroup label="Luồng việc">
            <ThreadList threads={threads} activeId={activeId} onSelect={onNavigate} />
          </SidebarGroup>
          <SidebarGroup label="Chức năng" className="hidden md:flex">
            {features.map((f) => (
              <NavButton key={f.id} icon={f.icon} active={activeId === f.id} onClick={() => onNavigate(f.id)}>
                {f.label}
              </NavButton>
            ))}
          </SidebarGroup>
        </nav>
        <div className="hidden items-center gap-2.5 border-t px-3.5 py-2.5 md:flex">
          <span className="grid size-7 place-items-center border bg-muted text-xs font-semibold">
            {shopName.slice(0, 2).toUpperCase()}
          </span>
          <div className="leading-tight">
            <b className="font-semibold">{shopName}</b>
            <small className="block text-xs text-muted-foreground">Cài đặt cửa hàng</small>
          </div>
        </div>
      </aside>
      <main className="flex min-h-0 min-w-0 flex-col">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b px-5">{props.topbar}</div>
        {props.children}
      </main>
    </div>
  )
}

function SidebarGroup({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-px px-2 py-1', className)}>
      <h4 className="mx-1.5 mt-2 mb-1 text-[11px] leading-4 font-semibold tracking-[0.06em] text-muted-foreground uppercase">
        {label}
      </h4>
      {children}
    </div>
  )
}

function NavButton({
  active,
  icon: Icon,
  children,
  onClick,
}: {
  active?: boolean
  icon: LucideIcon
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-8 w-full items-center gap-2.5 rounded-sm px-2 text-left',
        active ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'hover:bg-sidebar-accent',
      )}
    >
      <Icon className="size-4 shrink-0" strokeWidth={1.75} />
      {children}
    </button>
  )
}

/** Vùng cuộn của chat: cột tối đa 680px căn giữa, khoảng cách tin nhắn 16px. */
export function ChatFeed({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-[680px] flex-col gap-4 px-5 py-6">{children}</div>
    </div>
  )
}

/** Đáy khung chat, chứa Composer. */
export function ChatFooter({ children }: { children: React.ReactNode }) {
  return <div className="shrink-0 border-t px-5 pt-3 pb-3.5">{children}</div>
}

/** Đường dẫn trên thanh trên khi đang trong một luồng: "Chat trung tâm / Ghi sổ sao kê 26/11". */
export function ThreadBreadcrumb({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <button type="button" onClick={onBack} className="text-muted-foreground hover:underline">
        Chat trung tâm
      </button>
      <span className="text-muted-foreground">/</span>
      <b className="truncate font-semibold">{title}</b>
    </span>
  )
}

/** Dòng phạm vi đầu luồng: nói luồng này chỉ làm đúng việc gì. */
export function ThreadScope({ children }: { children: React.ReactNode }) {
  return <div className="border border-dashed px-3 py-2 text-xs text-muted-foreground">{children}</div>
}
