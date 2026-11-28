import { Fragment, type ReactNode } from 'react'

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : <Fragment key={index}>{part}</Fragment>,
  )
}

/** Văn bản AI: đoạn, xuống dòng, danh sách và chữ đậm; không diễn giải HTML. */
export function AssistantText({ text }: { text: string }) {
  const lines = text.split(/\r?\n/)
  const blocks: ReactNode[] = []
  let index = 0
  while (index < lines.length) {
    if (!lines[index].trim()) { index++; continue }
    const bullet = /^\s*[-*]\s+(.+)$/
    if (bullet.test(lines[index])) {
      const items: string[] = []
      while (index < lines.length) {
        const match = lines[index].match(bullet)
        if (!match) break
        items.push(match[1]); index++
      }
      blocks.push(<ul key={blocks.length} className="m-0 list-disc pl-5">{items.map((item, i) => <li key={i}>{inline(item)}</li>)}</ul>)
    } else {
      const paragraph: string[] = []
      while (index < lines.length && lines[index].trim() && !bullet.test(lines[index])) paragraph.push(lines[index++])
      blocks.push(<p key={blocks.length} className="m-0 whitespace-pre-wrap">{inline(paragraph.join('\n'))}</p>)
    }
  }
  return <div className="flex min-w-0 flex-col gap-2">{blocks}</div>
}
