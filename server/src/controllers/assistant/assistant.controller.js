import * as assistant from '../../services/assistant/assistant.service.js'
import { trackStream } from '../../services/assistant/events.js'
import * as approval from '../../services/assistant/approval.js'
import { uploadFile } from '../../services/assistant/files.js'
import { dismissProactive, requestProactiveScan } from '../../services/assistant/proactive.service.js'

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
  const untrack = trackStream(() => res.end())
  res.on('close', () => { closed = true; clearInterval(ping); unsubscribe(); untrack() })
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
  } catch (err) { unsubscribe(); untrack(); throw err }
}

export async function upload(req, res) { res.status(201).json(await uploadFile(req.auth.shopId,req.file)) }

export function refreshProactive(req, res) {
  requestProactiveScan(req.auth.shopId, { opened: true })
  res.sendStatus(204)
}

export async function dismissProactiveNotice(req, res) {
  await dismissProactive(req.auth.shopId, req.params.id)
  res.sendStatus(204)
}

export async function send(req, res) {
  await assistant.sendMessage(req.auth, req.body)
  res.sendStatus(204)
}

export async function answer(req, res) { await approval.answer(req.auth, req.params.id, req.body); res.sendStatus(204) }
export async function sensitiveDetails(req,res) { res.set('Cache-Control','no-store');res.json(await approval.sensitiveDetails(req.auth,req.params.id)) }
export async function messageRecipients(req,res) { res.json(await approval.messageRecipients(req.auth)) }
export async function updateMessageDraft(req,res) { await approval.updateMessageDraft(req.auth,req.params.id,req.body);res.sendStatus(204) }
export async function approve(req, res) { res.json(await approval.approve(req.auth, req.params.id, req.body)) }
export async function undo(req, res) { await approval.undo(req.auth, req.params.id, req.body); res.sendStatus(204) }
