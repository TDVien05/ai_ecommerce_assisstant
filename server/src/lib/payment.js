// Payment helpers shared by order creation and reconciliation.
//
// Payment code: `DH` + 8 random characters. The alphabet excludes 0/O/1/I because customers
// type the code into their banking app by hand, and those pairs are the usual mistakes.
// See docs/PAYMENT_ANTI_SCAM.md.
import crypto from 'node:crypto'

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ' // no 0 O 1 I
const PREFIX = 'DH'
const SUFFIX_LENGTH = 8

/** How long a customer has to pay before the order expires. */
export const PAYMENT_WINDOW_MINUTES = 30

/**
 * A payment code like `DH8F3K2AB`.
 * Collisions are handled by the UNIQUE constraint on orders.payment_code: the caller retries
 * with a new code. 32^8 ≈ 1.1e12 combinations, so a collision is already very unlikely.
 */
export function generatePaymentCode() {
  const bytes = crypto.randomBytes(SUFFIX_LENGTH)
  let code = PREFIX
  for (let i = 0; i < SUFFIX_LENGTH; i += 1) {
    code += ALPHABET[bytes[i] % ALPHABET.length]
  }
  return code
}

/** Deadline for a new order: now + PAYMENT_WINDOW_MINUTES. */
export function paymentDeadline(from = new Date()) {
  return new Date(from.getTime() + PAYMENT_WINDOW_MINUTES * 60 * 1000)
}

/**
 * VietQR image URL (NAPAS 247) for a shop's bank account.
 * Amount and transfer note are baked into the QR, so the customer cannot mistype them.
 * `addInfo` must be the payment code: that is what the webhook matches on.
 *
 * Uses the public img.vietqr.io endpoint; no API key, no SDK.
 */
export function vietQrUrl({ bankCode, accountNumber, accountName, amount, addInfo }) {
  if (!bankCode || !accountNumber) return null
  const params = new URLSearchParams({
    amount: String(Math.round(amount)),
    addInfo,
    accountName: accountName ?? '',
  })
  // `compact` keeps the payload small, which scans faster on older phones.
  return `https://img.vietqr.io/image/${encodeURIComponent(bankCode)}-${encodeURIComponent(accountNumber)}-compact2.png?${params}`
}

/**
 * Pull a payment code out of free text. Banks mangle the memo (extra words, spaces, case),
 * so this looks for the DH pattern anywhere. Returns null when there is none.
 */
export function extractPaymentCode(content) {
  const match = /\b(DH[A-Za-z0-9]{4,12})\b/i.exec(String(content ?? ''))
  return match ? match[1].toUpperCase() : null
}
