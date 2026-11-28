import * as assistant from '../services/assistant.service.js'

export async function stream(req, res) {
  let ready = false
  let closed = false
  const queued = []
  const write = ({ type, ...data }) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)
  const unsubscribe = assistant.subscribe(req.auth.shopId, (event) => {
    if (closed) return
    if (ready) write(event)
    else queued.push(event)
  })
  let ping
  res.on('close', () => { closed = true; clearInterval(ping); unsubscribe() })
  try {
    const snapshot = await assistant.snapshot(req.auth.shopId)
    if (closed) return
    res.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' })
    res.flushHeaders()
    write({ type: 'snapshot', snapshot })
    ready = true
    for (const event of queued) write(event)
    ping = setInterval(() => res.write(': ping\n\n'), 20_000)
    ping.unref()
  } catch (err) { unsubscribe(); throw err }
}

export async function send(req, res) {
  await assistant.sendMessage(req.auth.shopId, req.body)
  res.sendStatus(204)
}
