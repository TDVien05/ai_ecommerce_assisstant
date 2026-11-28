import { ingest } from '../../services/webhook/webhook.service.js'
import { badRequest } from '../../errors/index.js'

// POST /webhooks/sepay — the route already verified HMAC-SHA256 (or the API key).
// SePay counts a delivery as success only for 200/201 with exactly {"success": true} within
// 30 seconds, so the event is stored first and reconciliation runs right after (setImmediate).
export const receive = async (req, res) => {
  const payload = req.body ?? {}
  const externalId = payload.id !== undefined && payload.id !== null ? String(payload.id) : payload.referenceCode
  if (!externalId) throw badRequest('Thiếu id giao dịch SePay.')

  // When the URL carried a shop id, the signature proved that shop owns the secret. Trust it
  // over the account number lookup, so a payload cannot be routed to another tenant.
  const { duplicate, eventId } = await ingest({
    provider: 'sepay',
    externalId,
    type: 'payment.received',
    payload,
    defer: true,
    shopId: req.verifiedShopId ?? undefined,
  })

  // Extra fields are ignored by SePay but kept for our own diagnostics.
  res.status(200).json({ success: true, duplicate: Boolean(duplicate), eventId })
}
