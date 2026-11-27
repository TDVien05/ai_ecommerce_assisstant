import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readSse } from '../src/lib/ai/sse.ts'
import { applyEvent } from '../src/lib/ai/reduce.ts'

test('SSE xử lý khung bị chia và sự kiện trùng sau kết nối lại', async () => {
  const snapshot = { shopName: 'Cửa hàng', threads: [], conversations: { hub: [] }, typing: [] }
  const message = { id: 'notice-1', role: 'assistant', blocks: [{ type: 'text', text: 'Thông báo' }] }
  let requests = 0
  const server = createServer((_req, res) => {
    requests++
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' })
    const body = Buffer.from(`event: snapshot\r\ndata: ${JSON.stringify({ snapshot })}\r\n\r\nevent: message\r\ndata: ${JSON.stringify({ conversationId: 'hub', message })}\r\n\r\n`)
    for (let i = 0; i < body.length; i += 3) res.write(body.subarray(i, i + 3))
    res.end()
  })
  server.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  let state = null
  try {
    for (let i = 0; i < 2; i++) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/stream`)
      await readSse(response.body, (frame) => { state = applyEvent(state, { ...JSON.parse(frame.data), type: frame.event }) })
    }
    assert.equal(requests, 2)
    assert.equal(state.shopName, 'Cửa hàng')
    assert.equal(state.conversations.hub.length, 1)
    assert.equal(state.conversations.hub[0].blocks[0].text, 'Thông báo')
  } finally { await new Promise((resolve) => server.close(resolve)) }
})
