import { useEffect, useRef } from 'react'
import { AssistantMessage, ChatFeed, ChatFooter, Composer, DayDivider, ThreadScope, UserMessage } from '@/components/flowy'
import { ai, HUB, type ConversationId, type Message } from '@/lib/ai'
import { run } from './actions'
import { BlockView } from './BlockView'

type ChatViewProps = {
  conversationId: ConversationId
  messages: Message[]
  typing: boolean
  /** Dòng phạm vi, chỉ có trong luồng việc. */
  scope?: string
  onOpenThread: (id: string) => void
}

const now = new Date()
const todayLabel = `Hôm nay, ${now.getDate()}/${now.getMonth() + 1}`

/** Khung chat của chat trung tâm hoặc một luồng việc. */
export function ChatView({ conversationId, messages, typing, scope, onOpenThread }: ChatViewProps) {
  const hub = conversationId === HUB
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, typing])

  return (
    <>
      <ChatFeed>
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
          placeholder={hub ? undefined : 'Nhắn trong luồng này...'}
          suggestions={hub ? ['Lãi tuần này?', 'Đơn nào chưa thanh toán?', 'Nhập sao kê'] : undefined}
          onSubmit={(text, files) => run(ai.send(conversationId, text, files))}
        />
      </ChatFooter>
    </>
  )
}
