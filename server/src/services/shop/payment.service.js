import { z } from 'zod'
import { encryptSecret, decryptSecret, maskSecret, isEncryptionConfigured } from '../../lib/secrets.js'
import * as shopRepo from '../../repositories/shop/shop.repository.js'
import { appError, badRequest } from '../../errors/index.js'

/**
 * Payment credentials of one shop (model A).
 *
 * Each shop connects its own gateway account, so the secret belongs to the shop and is stored
 * encrypted. The client can set it, replace it, delete it, and read back only a mask — never
 * the plaintext, because the whole point is that the server holds it, not the browser.
 */

const setSchema = z.object({
  // SePay issues the secret; we only require it to be long enough to be a real key.
  secret: z.string().trim().min(16).max(256),
  provider: z.enum(['sepay']).default('sepay'),
}).strict()

function validateShopId(shopId) {
  if (!z.string().uuid().safeParse(shopId).success) throw badRequest('Cửa hàng không hợp lệ.')
}

export async function getPaymentConfig(shopId) {
  validateShopId(shopId)
  const shop = await shopRepo.findById(shopId)
  if (!shop) throw appError('SHOP_NOT_FOUND', 'Không tìm thấy cửa hàng.')

  // Read the stored envelope, but only ever report whether it exists and its last 4 characters.
  const stored = await shopRepo.findWebhookSecret(shopId)
  let mask = null
  if (stored) {
    try {
      // Only for the mask; a broken envelope still reports "configured" below.
      mask = maskSecret(decryptSecret(stored))
    } catch {
      mask = '****'
    }
  }

  return {
    provider: shop.payment_provider ?? null,
    hasSecret: Boolean(stored),
    secretMask: mask,
    bankAccountNumber: shop.bank_account_number,
    // What the shop must paste into its own gateway dashboard.
    webhookPath: `/webhooks/sepay/${shopId}`,
    encryptionConfigured: isEncryptionConfigured(),
  }
}

export async function setPaymentSecret(shopId, input) {
  validateShopId(shopId)
  if (!isEncryptionConfigured()) {
    throw appError('NOT_CONFIGURED', 'Chưa cấu hình APP_ENCRYPTION_KEY trên máy chủ.')
  }

  const parsed = setSchema.safeParse(input)
  if (!parsed.success) {
    throw badRequest('Webhook secret không hợp lệ.', parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })))
  }

  const shop = await shopRepo.findById(shopId)
  if (!shop) throw appError('SHOP_NOT_FOUND', 'Không tìm thấy cửa hàng.')
  if (shop.is_demo) throw badRequest('Shop thử không cần cấu hình thanh toán.')

  const encrypted = encryptSecret(parsed.data.secret)
  await shopRepo.saveWebhookSecret(shopId, encrypted, parsed.data.provider)

  return {
    provider: parsed.data.provider,
    hasSecret: true,
    secretMask: maskSecret(parsed.data.secret),
    webhookPath: `/webhooks/sepay/${shopId}`,
  }
}

/** Remove the secret: the shop stops accepting webhook deliveries until it sets a new one. */
export async function clearPaymentSecret(shopId) {
  validateShopId(shopId)
  const shop = await shopRepo.findById(shopId)
  if (!shop) throw appError('SHOP_NOT_FOUND', 'Không tìm thấy cửa hàng.')

  await shopRepo.saveWebhookSecret(shopId, null, null)
  return { provider: null, hasSecret: false, secretMask: null }
}
