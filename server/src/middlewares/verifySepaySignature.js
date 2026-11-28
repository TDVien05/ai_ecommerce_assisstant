import crypto from 'node:crypto'
import { env } from '../config/env.js'
import { appError, unauthorized } from '../errors/index.js'
import { decryptSecret } from '../lib/secrets.js'
import { findWebhookSecret } from '../repositories/shop/shop.repository.js'

/**
 * Verify SePay's HMAC-SHA256 signature, using the secret of the shop in the URL.
 *
 * Spec: https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc
 * SePay signs `{timestamp}.{raw_body}` and sends:
 *   X-SePay-Signature: sha256=<hex>
 *   X-SePay-Timestamp: <unix seconds>
 *
 * Multi-shop (model A): every shop connects its own gateway account, so every shop has its own
 * secret. The route is /webhooks/sepay/:shopId and this middleware resolves that shop's secret
 * before comparing. A single global secret could not verify two shops.
 *
 * The RAW body is required: re-serializing a parsed body changes the bytes (key order,
 * Unicode escaping, whitespace) and the signature no longer matches. Hence express.raw()
 * before express.json(), exactly like the Messenger webhook.
 */

const MAX_SKEW_SECONDS = 300

/** Build the signature SePay would send for this body. Exported for tests. */
export function signPayload(rawBody, timestamp, secret) {
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody ?? ''))
  return 'sha256=' + crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(body).digest('hex')
}

/** Constant-time compare that never throws on a length mismatch. */
function safeEqual(left, right) {
  const a = Buffer.from(String(left ?? ''))
  const b = Buffer.from(String(right ?? ''))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/**
 * Resolve the plaintext secret for a shop.
 * Order: the shop's own encrypted secret, then the global env fallback (single-shop installs
 * and the seeded template). Returns null when neither is available.
 */
export async function secretForShop(shopId) {
  // No shop in the URL (legacy single-shop route): use the global secret only.
  if (!shopId) return env.SEPAY_WEBHOOK_SECRET ?? null

  try {
    const stored = await findWebhookSecret(shopId)
    if (stored) return decryptSecret(stored)
  } catch {
    // A broken envelope or a missing APP_ENCRYPTION_KEY must not silently fall through to the
    // global secret: that would verify with the wrong key. Fail loudly instead.
    throw appError('NOT_CONFIGURED', 'Không giải mã được webhook secret của cửa hàng.')
  }

  // A known shop without its own secret may still use the global one (template shop, migration).
  return env.SEPAY_WEBHOOK_SECRET ?? null
}

export async function verifySepaySignature(req, _res, next) {
  const shopId = req.params?.shopId ?? null
  const secret = await secretForShop(shopId)

  if (!secret) {
    throw appError(
      'NOT_CONFIGURED',
      shopId ? 'Cửa hàng chưa cấu hình SePay webhook secret.' : 'SePay webhook (HMAC) is not configured',
    )
  }

  const signature = req.get('x-sepay-signature')
  const timestamp = req.get('x-sepay-timestamp')
  if (!signature || !timestamp) throw unauthorized('Missing SePay signature headers')

  // Replay window: reject old or future timestamps.
  const seconds = Number(timestamp)
  if (!Number.isFinite(seconds) || Math.abs(Math.floor(Date.now() / 1000) - seconds) > MAX_SKEW_SECONDS) {
    throw unauthorized('SePay signature timestamp is outside the allowed window')
  }

  // express.raw() gives a Buffer; anything else means the body was already parsed.
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
  const expected = signPayload(raw, timestamp, secret)

  if (!safeEqual(expected, signature)) throw unauthorized('Invalid SePay signature')

  try {
    req.body = JSON.parse(raw.toString('utf8'))
  } catch {
    throw appError('INVALID_JSON', 'Malformed JSON body')
  }

  // Hand the verified shop to the controller so the payload cannot pick a different tenant.
  req.verifiedShopId = shopId
  next()
}
