import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Navigate, useMatch, useNavigate } from 'react-router-dom'
import { AppShell, StateLabel, THREAD_STATUS_LABEL, ThreadBreadcrumb } from '@/components/flowy'
import { Button } from '@/components/ui/button'
import { ChatView } from '@/features/app/ChatView'
import { FeaturePage } from '@/features/app/FeaturePage'
import { FEATURES } from '@/features/app/features'
import { useFlowy } from '@/features/app/useFlowy'
import { HUB } from '@/lib/ai'
import { useAuth } from '@/features/auth/useAuth'
import { isReal } from '@/lib/realApi'

/** Màn hình chính: "/" chat trung tâm, "/threads/:id" luồng việc, "/pages/:id" trang chức năng. */
export default function AppPage() {
  const { session } = useAuth()
  if (!session?.shop.isDemo && !isReal('assistant')) return <EmptyApp />
  return <DemoApp />
}

function DemoApp() {
  const { state, connection } = useFlowy()
  const { session, logout } = useAuth()
  const navigate = useNavigate()
  const threadId = useMatch('/threads/:id')?.params.id
  const featureId = useMatch('/pages/:id')?.params.id
  const atHub = Boolean(useMatch('/app'))

  if (!state) return <div role="status" className="grid min-h-screen place-items-center text-muted-foreground">{connection === 'disconnected' ? 'Không kết nối được chat. Mình đang thử lại.' : 'Đang kết nối chat…'}</div>

  const thread = state.threads.find((t) => t.id === threadId)
  const feature = FEATURES.find((f) => f.id === featureId) ?? (featureId === 'settings' ? { id: 'settings', label: 'Cài đặt cửa hàng', about: 'Thông tin cửa hàng và tài khoản nhận tiền.' } : undefined)
  if (!atHub && !thread && !feature) return <Navigate to="/app" replace />

  const conversationId = thread?.id ?? HUB
  const go = (id: string) => {
    if (id === HUB) navigate('/app')
    else if (FEATURES.some((f) => f.id === id)) navigate(`/pages/${id}`)
    else if (id === 'settings') navigate('/pages/settings')
    else navigate(`/threads/${id}`)
  }

  return (
    <AppShell
      shopName={session?.shop.name ?? state.shopName}
      hubPending={state.threads.filter((t) => t.status === 'alert' || t.status === 'waiting').length}
      threads={state.threads}
      features={FEATURES}
      activeId={feature?.id ?? conversationId}
      onNavigate={go}
      topbar={
        <>
          {thread ? (
            <ThreadBreadcrumb title={thread.title} onBack={() => go(HUB)} />
          ) : (
            <b className="font-semibold">{feature ? feature.label : 'Chat trung tâm'}</b>
          )}
          <span className="flex-1" />
          {thread && <StateLabel muted={thread.status === 'done'}>{THREAD_STATUS_LABEL[thread.status]}</StateLabel>}
          {feature && (
            <Button variant="outline" onClick={() => go(HUB)}>
              Hỏi AI về trang này
            </Button>
          )}
          <ThemeToggle />
          <Button variant="ghost" onClick={() => { logout(); window.location.assign('/') }}>Đăng xuất</Button>
        </>
      }
    >
      {feature ? (
        <FeaturePage id={feature.id} title={feature.label} about={feature.about} allowMock={session?.shop.isDemo === true} />
      ) : (
        <ChatView
          key={conversationId}
          conversationId={conversationId}
          messages={state.conversations[conversationId] ?? []}
          notices={state.proactive?.notices}
          typing={state.typing.includes(conversationId)}
          connected={connection === 'connected'}
          scope={thread?.scope}
          onOpenThread={go}
        />
      )}
    </AppShell>
  )
}

function EmptyApp() {
  const { session, logout } = useAuth()
  const navigate = useNavigate()
  const featureId = useMatch('/pages/:id')?.params.id
  const feature = FEATURES.find((item) => item.id === featureId) ?? (featureId === 'settings' ? { id: 'settings', label: 'Cài đặt cửa hàng', about: 'Thông tin cửa hàng và tài khoản nhận tiền.' } : undefined)
  const go = (id: string) => navigate(id === HUB ? '/app' : `/pages/${id}`)
  return <AppShell shopName={session?.shop.name ?? ''} hubPending={0} threads={[]} features={FEATURES} activeId={feature?.id ?? HUB} onNavigate={go}
    topbar={<><b className="font-semibold">{feature?.label ?? 'Chat trung tâm'}</b><span className="flex-1" /><ThemeToggle /><Button variant="ghost" onClick={() => { logout(); window.location.assign('/') }}>Đăng xuất</Button></>}>
    <div className="flex-1 overflow-y-auto"><div className="mx-auto max-w-2xl space-y-4 p-6">
      {feature ? <><h1 className="text-[22px] font-semibold">{feature.label}</h1><p>{feature.about}</p><p className="border border-dashed p-4 text-muted-foreground">Chưa có dữ liệu. Hãy kết nối nguồn dữ liệu để bắt đầu.</p></> : <><h1 className="text-[22px] font-semibold">Chào mừng bạn đến với Flowy</h1><div className="border p-4"><p>Mình là Flowy. Bạn có thể bắt đầu bằng cách kết nối nguồn dữ liệu của cửa hàng.</p><p className="mt-2 text-sm text-muted-foreground">Các tính năng dữ liệu thật sẽ sẵn sàng khi kết nối máy chủ.</p></div><Button variant="outline" onClick={() => go('sources')}>Xem nguồn dữ liệu</Button></>}
    </div></div>
  </AppShell>
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const dark = resolvedTheme === 'dark'
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Đổi giao diện sáng/tối"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  )
}
