export type SseFrame = { event: string; data: string }

/** Đọc từng dòng SSE kể cả khi UTF-8 hoặc CRLF bị chia giữa các chunk. */
export async function readSse(stream: ReadableStream<Uint8Array>, onFrame: (frame: SseFrame) => void): Promise<void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let event = ''
  let data: string[] = []
  function line(value: string) {
    if (!value) {
      if (data.length) onFrame({ event: event || 'message', data: data.join('\n') })
      event = ''; data = []; return
    }
    if (value.startsWith(':')) return
    const colon = value.indexOf(':')
    const field = colon < 0 ? value : value.slice(0, colon)
    let content = colon < 0 ? '' : value.slice(colon + 1)
    if (content.startsWith(' ')) content = content.slice(1)
    if (field === 'data') data.push(content)
    if (field === 'event') event = content
  }
  function consume(final: boolean) {
    while (true) {
      const index = buffer.search(/[\r\n]/)
      if (index < 0 || (!final && buffer[index] === '\r' && index === buffer.length - 1)) break
      const size = buffer[index] === '\r' && buffer[index + 1] === '\n' ? 2 : 1
      line(buffer.slice(0, index)); buffer = buffer.slice(index + size)
    }
    if (buffer.length > 1024 * 1024) throw new Error('Dòng sự kiện quá lớn.')
  }
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true }); consume(false)
    }
    buffer += decoder.decode(); consume(true)
  } finally { reader.releaseLock() }
}
