import { ingest } from '../services/webhook.service.js'
import { badRequest } from '../lib/httpError.js'

/**
 * POST /webhooks/sim — the in-app "Try the bot" / "Simulate payment" pipe.
 * The payload keeps the Messenger or SePay shape, so it lands on the exact same handlers.
 */
export const receive = async (req, res) => {
  const payload = req.body ?? {}

  const { type, externalId } = describe(payload)
  const result = await ingest({ provider: 'sim', externalId, type, payload, defer: true })
  res.json({ success: true, ...result, type })
}

function describe(payload) {
  if (payload.object === 'page') {
    const messaging = payload.entry?.[0]?.messaging?.[0]
    const type = messaging?.message ? 'messenger.message' : messaging?.postback ? 'messenger.postback' : null
    if (!type) throw badRequest('Sự kiện Messenger mô phỏng không hợp lệ.')
    const externalId = messaging.message?.mid ?? `${messaging.sender?.id}:${messaging.timestamp}`
    return { type, externalId }
  }

  if (payload.transferAmount !== undefined || payload.transferType) {
    const externalId = payload.id !== undefined && payload.id !== null ? String(payload.id) : payload.referenceCode
    if (!externalId) throw badRequest('Sự kiện thanh toán mô phỏng cần id hoặc referenceCode.')
    return { type: 'payment.received', externalId }
  }

  throw badRequest('Không nhận ra hình dạng sự kiện mô phỏng.')
}
