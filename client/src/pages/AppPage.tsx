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

/** Màn hình chính: "/" chat trung tâm, "/threads/:id" luồng việc, "/pages/:id" trang chức năng. */
export default function AppPage() {
  const state = useFlowy()
  const navigate = useNavigate()
  const threadId = useMatch('/threads/:id')?.params.id
  const featureId = useMatch('/pages/:id')?.params.id
  const atHub = Boolean(useMatch('/'))

  if (!state) return null

  const thread = state.threads.find((t) => t.id === threadId)
  const feature = FEATURES.find((f) => f.id === featureId)
  if (!atHub && !thread && !feature) return <Navigate to="/" replace />

  const conversationId = thread?.id ?? HUB
  const go = (id: string) => {
    if (id === HUB) navigate('/')
    else if (FEATURES.some((f) => f.id === id)) navigate(`/pages/${id}`)
    else navigate(`/threads/${id}`)
  }

  return (
    <AppShell
      shopName={state.shopName}
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
        </>
      }
    >
      {feature ? (
        <FeaturePage id={feature.id} title={feature.label} about={feature.about} />
      ) : (
        <ChatView
          key={conversationId}
          conversationId={conversationId}
          messages={state.conversations[conversationId] ?? []}
          typing={state.typing.includes(conversationId)}
          scope={thread?.scope}
          onOpenThread={go}
        />
      )}
    </AppShell>
  )
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
