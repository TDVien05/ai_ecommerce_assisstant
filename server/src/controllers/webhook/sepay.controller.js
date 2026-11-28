import { ingest } from '../../services/webhook/webhook.service.js'
import { badRequest } from '../../lib/httpError.js'

// POST /webhooks/sepay — API key already checked by the route's middleware.
// The event is stored before answering 200; reconciliation runs right after (setImmediate).
export const receive = async (req, res) => {
  const payload = req.body ?? {}
  const externalId = payload.id !== undefined && payload.id !== null ? String(payload.id) : payload.referenceCode
  if (!externalId) throw badRequest('Thiếu id giao dịch SePay.')

  const { duplicate, eventId } = await ingest({
    provider: 'sepay',
    externalId,
    type: 'payment.received',
    payload,
    defer: true,
  })

  res.json({ success: true, duplicate: Boolean(duplicate), eventId })
}
