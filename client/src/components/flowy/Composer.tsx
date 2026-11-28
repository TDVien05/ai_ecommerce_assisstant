import { useRef, useState } from 'react'
import { ArrowUp, Paperclip } from 'lucide-react'

type ComposerProps = {
  onSubmit: (text: string, files: File[]) => void | boolean | Promise<void | boolean>
  /** Tối đa 3 câu gợi ý, viết như lời người dùng sẽ nói. Ẩn khi đang gõ. */
  suggestions?: string[]
  placeholder?: string
  disabled?: boolean
}

/** Ô chat ở đáy khung chat. Enter để gửi, Shift+Enter xuống dòng. */
export function Composer({
  onSubmit,
  suggestions = [],
  placeholder = 'Nhắn cho AI: giao việc mới, hỏi lãi lỗ, kiểm tra đơn...',
  disabled,
}: ComposerProps) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const sendingRef = useRef(false)

  const send = async (value = text) => {
    if (disabled || sendingRef.current || (!value.trim() && files.length === 0)) return
    sendingRef.current = true
    setSending(true)
    const sentFiles = files
    try {
      const accepted = await onSubmit(value.trim(), sentFiles)
      if (accepted !== false) {
        setText((current) => current === value ? '' : current)
        setFiles((current) => current === sentFiles ? [] : current)
      }
    } finally { sendingRef.current = false; setSending(false) }
  }

  return (
    <div className="mx-auto flex w-full max-w-[680px] flex-col gap-2">
      {suggestions.length > 0 && !text && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.slice(0, 3).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void send(s)}
              disabled={disabled || sending}
              className="h-7 rounded-sm border bg-background px-2.5 text-[13px] hover:bg-accent"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-1.5 rounded-sm border border-input bg-background py-2 pr-2 pl-1 focus-within:border-foreground focus-within:ring-1 focus-within:ring-foreground">
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          accept=".xlsx,.xls,.csv,image/*"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
        <button
          type="button"
          aria-label="Đính kèm sao kê hoặc ảnh"
          onClick={() => fileRef.current?.click()}
          className="grid size-8 place-items-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Paperclip className="size-4" />
        </button>
        <textarea
          rows={1}
          value={text}
          placeholder={files.length ? `${files.length} file đính kèm. Thêm lời nhắn...` : placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              if (!disabled && !sending) void send()
            }
          }}
          className="max-h-36 min-w-0 flex-1 resize-none self-center bg-transparent text-base leading-6 outline-none [field-sizing:content] placeholder:text-muted-foreground"
        />
        <button
          type="button"
          aria-label="Gửi"
          onClick={() => void send()}
          disabled={disabled || sending || (!text.trim() && files.length === 0)}
          className="grid size-8 shrink-0 place-items-center rounded-sm bg-primary text-primary-foreground disabled:opacity-35"
        >
          <ArrowUp className="size-4" />
        </button>
      </div>
    </div>
  )
}
