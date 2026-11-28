import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AssistantMessage, ChatFeed, ChatFooter, Composer, DayDivider, ThreadScope, UserMessage } from '@/components/flowy'
import { ai, HUB, type ConversationId, type Message } from '@/lib/ai'
import { ApiError } from '@/lib/api'
import { BlockView } from './BlockView'

type ChatViewProps = {
  conversationId: ConversationId
  messages: Message[]
  typing: boolean
  connected: boolean
  /** Dòng phạm vi, chỉ có trong luồng việc. */
  scope?: string
  onOpenThread: (id: string) => void
}

const now = new Date()
const todayLabel = `Hôm nay, ${now.getDate()}/${now.getMonth() + 1}`

/** Khung chat của chat trung tâm hoặc một luồng việc. */
export function ChatView({ conversationId, messages, typing, connected, scope, onOpenThread }: ChatViewProps) {
  const hub = conversationId === HUB
  const endRef = useRef<HTMLDivElement>(null)
  const [pending, setPending] = useState<{ lastAssistantId: string | undefined } | null>(null)
  const lastAssistantId = [...messages].reverse().find((message) => message.role === 'assistant')?.id
  const waiting = pending !== null && pending.lastAssistantId === lastAssistantId

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, typing])

  return (
    <>
      <ChatFeed>
        {!connected && <p role="status" className="m-0 border border-border p-3 text-muted-foreground">Mất kết nối chat. Mình đang thử kết nối lại.</p>}
        {scope ? <ThreadScope>{scope}</ThreadScope> : <DayDivider>{todayLabel}</DayDivider>}
        {messages.map((m) =>
          m.role === 'user' ? (
            <UserMessage key={m.id} files={m.files}>
              {m.text}
            </UserMessage>
          ) : (
            <AssistantMessage key={m.id}>
              {m.blocks.map((block, i) => (
                <BlockView key={i} block={block} onOpenThread={onOpenThread} />
              ))}
            </AssistantMessage>
          ),
        )}
        {typing && <AssistantMessage live />}
        <div ref={endRef} />
      </ChatFeed>
      <ChatFooter>
        {/* key: mỗi hội thoại có bản nháp riêng */}
        <Composer
          key={conversationId}
          disabled={!connected || typing || waiting}
          placeholder={hub ? undefined : 'Nhắn trong luồng này...'}
          suggestions={hub ? ['Lãi tuần này?', 'Đơn nào chưa thanh toán?', 'Nhập sao kê'] : undefined}
          onSubmit={async (text, files) => {
            setPending({ lastAssistantId })
            try {
              const attachments = await Promise.all(files.map((f) => ai.upload(f)))
              await ai.send({ conversationId, text, attachments })
              return true
            } catch (error) {
              setPending(null)
              toast.error(error instanceof ApiError && error.code === 'ASSISTANT_BUSY' ? 'Hội thoại đang trả lời. Bạn chờ một chút rồi gửi lại nhé.' : error instanceof Error ? error.message : 'Không gửi được. Bạn thử lại nhé.')
              return false
            }
          }}
        />
      </ChatFooter>
    </>
  )
}
