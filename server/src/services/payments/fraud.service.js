import * as shopsRepo from '../../repositories/shop/shop.repository.js'
import * as blocklistRepo from '../../repositories/payments/blocklist.repository.js'
import * as paymentsRepo from '../../repositories/payments/paymentTransaction.repository.js'
import * as fraudRepo from '../../repositories/payments/fraudCheck.repository.js'
import { logger } from '../../lib/logger.js'

/**
 * Hard-rule fraud layer (no AI). Every check writes at least one fraud_checks row, so the
 * dashboard can show "this event was checked" even when nothing is wrong.
 *
 * Levels: LOW = clean, MEDIUM = suspicious but handled, HIGH = do not process.
 */

const firstMessaging = (payload) => payload?.entry?.[0]?.messaging?.[0] ?? null

function senderPsid(payload) {
  return firstMessaging(payload)?.sender?.id ?? null
}

export async function check({ shopId, provider, externalId, type, payload }) {
  const findings = []

  if (type === 'messenger.message' || type === 'messenger.postback') {
    const psid = senderPsid(payload)
    if (shopId && psid) {
      const blocked = await blocklistRepo.isBlocked(shopId, 'PSID', psid)
      if (blocked) {
        findings.push({
          level: 'HIGH',
          rule: 'blocked_sender',
          reason: 'Người gửi nằm trong danh sách chặn của shop.',
          metadata: { psid, blocklistId: blocked.id },
        })
      }
    }
  }

  if (type === 'payment.received') {
    const shop = shopId ? await shopsRepo.findById(shopId) : null

    if (payload?.transferType === 'out') {
      findings.push({
        level: 'HIGH',
        rule: 'outgoing_transfer',
        reason: 'Giao dịch tiền ra không bao giờ được dùng để xác nhận đơn.',
        metadata: { transferType: payload.transferType },
      })
    }

    if (shop?.bank_account_number && payload?.accountNumber && shop.bank_account_number !== payload.accountNumber) {
      findings.push({
        level: 'HIGH',
        rule: 'wrong_receiving_account',
        reason: 'Số tài khoản nhận không phải của shop.',
        metadata: { received: payload.accountNumber, expected: shop.bank_account_number },
      })
    }

    const code = payload?.code ?? extractPaymentCode(payload?.content)
    if (shopId && code) {
      const reused = await paymentsRepo.hasMatchedCode(shopId, code)
      if (reused) {
        findings.push({
          level: 'HIGH',
          rule: 'reused_payment_code',
          reason: 'Mã thanh toán này đã được đối soát ở một giao dịch trước đó.',
          metadata: { code },
        })
      }
    }
  }

  const rows = []
  if (!findings.length) {
    rows.push(await fraudRepo.record(shopId, {
      provider,
      externalId,
      level: 'LOW',
      rule: 'passed',
      reason: 'Không vi phạm luật cứng nào.',
    }))
  } else {
    for (const finding of findings) {
      rows.push(await fraudRepo.record(shopId, { provider, externalId, ...finding }))
    }
  }

  return {
    level: findings.some((f) => f.level === 'HIGH') ? 'HIGH' : findings.length ? 'MEDIUM' : 'LOW',
    blocked: findings.some((f) => f.level === 'HIGH'),
    findings,
    rows,
  }
}

/** `content` may be "DH8F3K2A chuyen tien" → DH8F3K2A. */
export function extractPaymentCode(content) {
  const match = /\b(DH[A-Z0-9]{4,10})\b/i.exec(String(content ?? ''))
  return match ? match[1].toUpperCase() : null
}

/**
 * A request that fails signature/API-key verification never reaches a handler, but it is
 * still evidence: record the metadata (never the body) and answer 403.
 */
export async function recordSignatureFailure({ provider, reason, metadata = {} }) {
  try {
    return await fraudRepo.record(null, {
      provider,
      level: 'HIGH',
      rule: 'invalid_signature',
      reason,
      metadata,
    })
  } catch (error) {
    logger.warn({ err: error }, 'Could not record the signature failure')
    return null
  }
}
