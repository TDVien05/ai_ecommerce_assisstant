import { withTransaction } from '../../repositories/database.js'
import * as orderRepo from '../../repositories/orders/order.repository.js'
import * as shopRepo from '../../repositories/shop/shop.repository.js'
import * as paymentRepo from '../../repositories/payments/paymentTransaction.repository.js'
import * as ledgerRepo from '../../repositories/finance/ledgerEntry.repository.js'
import * as productRepo from '../../repositories/products/product.repository.js'
import * as todoRepo from '../../repositories/shop/todo.repository.js'
import { extractPaymentCode } from '../../lib/payment.js'
import { logger } from '../../lib/logger.js'

/**
 * Payment reconciliation: SePay says money arrived, this decides what it means for the order.
 *
 * The rules come from docs/PAYMENT_ANTI_SCAM.md. The important design choice is that money
 * never disappears silently. A transfer that arrives late, short or twice is still recorded and
 * still leaves a `todos` row for the shop owner. Only the "everything matches" case flips the
 * order to PAID automatically.
 *
 * Outcomes (also stored in payment_transactions.match_status):
 *   MATCHED    exact or over payment on an open order  -> order PAID
 *   UNDERPAID  not enough money                        -> order stays AWAITING_PAYMENT
 *   NO_ORDER   no order carries that code              -> nothing else happens
 *   IGNORED    outgoing transfer, wrong account, etc.  -> nothing else happens
 */

const money = (value) => {
  const amount = Number(value)
  if (!Number.isSafeInteger(amount)) throw new Error('Unsafe integer in payment data')
  return amount
}

const formatVnd = (value) => `${money(value).toLocaleString('vi-VN')} ₫`

const seller = (order) => order.shop_id

/** First messaging event of a Messenger payload, or null for other providers. */
const firstMessaging = (payload) => payload?.entry?.[0]?.messaging?.[0] ?? null

/**
 * Decide what a SePay payload means. Pure function (no DB) so the rules stay readable and
 * testable: the caller feeds it the order and the shop, and acts on the verdict.
 */
export function classifyTransfer({ payload, order, shop }) {
  if (payload?.transferType === 'out') {
    return { matchStatus: 'IGNORED', reason: 'outgoing_transfer' }
  }

  // The receiving account must belong to this shop. Without this, paying shop A's account with
  // shop B's code would mark B's order paid.
  if (
    shop?.bank_account_number &&
    payload?.accountNumber &&
    shop.bank_account_number !== payload.accountNumber
  ) {
    return { matchStatus: 'IGNORED', reason: 'wrong_receiving_account' }
  }

  if (!order) {
    return { matchStatus: 'NO_ORDER', reason: 'unknown_payment_code' }
  }

  const amount = money(payload?.transferAmount ?? 0)

  if (amount < money(order.total)) {
    return {
      matchStatus: 'UNDERPAID',
      reason: 'short_payment',
      shortfall: money(money(order.total) - amount),
    }
  }

  return { matchStatus: 'MATCHED', reason: 'paid_in_full' }
}

/**
 * Mark an order paid: status, ledger income, stock decrement, all in the caller's transaction.
 * Guarded by a compare-and-set so two concurrent webhooks cannot both apply it.
 */
async function applyPaid(shopId, order, transaction, client) {
  const flipped = await orderRepo.markPaidIfAwaiting(
    shopId,
    order.id,
    transaction.transactionDate ?? null,
    client,
  )
  if (!flipped) {
    // Someone (another webhook, the expiry sweep) moved it first: do not double-apply.
    return null
  }

  await ledgerRepo.createOnce(
    shopId,
    {
      type: 'INCOME',
      kind: 'BUSINESS_REVENUE',
      channel: 'BANK',
      category: 'SALES',
      amount: money(transaction.transferAmount),
      orderId: order.id,
      note: `Thu tiền đơn ${order.payment_code}`,
      occurredAt: transaction.transactionDate ?? new Date(),
      source: 'sepay',
      dedupeKey: `sepay:${transaction.sepayId}`,
    },
    client,
  )

  // Selling reduces stock. A product may already be gone; adjustStock refuses to go negative.
  const items = await orderRepo.findItemsForStock(shopId, order.id, client)
  for (const item of items) {
    await productRepo.adjustStock(shopId, item.product_id, -item.quantity, client)
  }

  return flipped
}

/**
 * Record the transaction row. Idempotent on sepay_id, so a provider retry returns the row we
 * already have with `inserted: false` and the caller stops.
 */
async function recordTransaction(shopId, payload, verdict, orderId, client) {
  return paymentRepo.insert(
    shopId,
    {
      sepayId: Number(payload.id),
      gateway: payload.gateway ?? null,
      accountNumber: payload.accountNumber ?? null,
      code: payload.code ?? null,
      content: payload.content ?? null,
      referenceCode: payload.referenceCode ?? null,
      transferType: payload.transferType ?? null,
      transferAmount: money(payload.transferAmount ?? 0),
      transactionDate: payload.transactionDate ? new Date(payload.transactionDate) : null,
      orderId,
      matchStatus: verdict.matchStatus,
      raw: payload,
    },
    client,
  )
}

/**
 * Main entry point, registered as the `payment.received` handler.
 * Returns a summary the caller can log; throws only on unexpected failures.
 */
export async function reconcilePayment({ shopId, payload, eventId }) {
  if (!shopId) {
    logger.warn({ eventId }, 'payment received for an unknown shop, nothing to reconcile')
    return { outcome: 'NO_SHOP' }
  }

  return withTransaction(async (client) => {
    // Lock the order row so a concurrent webhook or the expiry sweep cannot race us.
    const code = payload?.code ?? extractPaymentCode(payload?.content)
    const row = code ? await orderRepo.findOrder(shopId, code, client, true) : null
    const order = row ? { ...row, total: row.total, shop_id: shopId } : null
    const shop = await shopRepo.findForPayment(shopId, client)

    const verdict = classifyTransfer({ payload, order, shop })

    const { transaction, inserted } = await recordTransaction(
      shopId,
      payload,
      verdict,
      order?.id ?? null,
      client,
    )

    if (!inserted) {
      logger.info({ shopId, sepayId: payload?.id }, 'duplicate SePay transaction, already reconciled')
      return { outcome: 'DUPLICATE', matchStatus: transaction?.match_status ?? null }
    }

    // The money arrived but the order is not payable: record it and ask the owner what to do.
    if (verdict.matchStatus === 'NO_ORDER') {
      await todoRepo.create(
        shopId,
        {
          title: `Giao dịch không khớp đơn: ${formatVnd(payload?.transferAmount ?? 0)}`,
          detail: `Mã đơn "${code ?? 'không có'}" không tồn tại. Nội dung: ${payload?.content ?? ''}`,
          dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
        client,
      )
      return { outcome: 'NO_ORDER', transactionId: transaction?.id }
    }

    if (verdict.matchStatus === 'IGNORED') {
      await todoRepo.create(
        shopId,
        {
          title: `Giao dịch bị bỏ qua: ${formatVnd(payload?.transferAmount ?? 0)}`,
          detail: `Lý do: ${verdict.reason}. Nội dung: ${payload?.content ?? ''}`,
          dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
        client,
      )
      return { outcome: 'IGNORED', reason: verdict.reason }
    }

    if (verdict.matchStatus === 'UNDERPAID') {
      await todoRepo.create(
        shopId,
        {
          title: `Đơn ${order.payment_code} chuyển thiếu ${formatVnd(verdict.shortfall)}`,
          detail: `Đã nhận ${formatVnd(payload?.transferAmount ?? 0)} trên tổng ${formatVnd(order.total)}. Khách cần chuyển thêm ${formatVnd(verdict.shortfall)}.`,
          orderId: order.id,
          dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
        client,
      )
      return {
        outcome: 'UNDERPAID',
        orderId: order.id,
        shortfall: verdict.shortfall,
        orderStatus: order.status,
      }
    }

    // MATCHED: is the order still open?
    if (order.status === 'PAID') {
      // Paid twice: keep the money visible instead of pretending nothing happened.
      await todoRepo.create(
        shopId,
        {
          title: `Đơn ${order.payment_code} nhận thêm ${formatVnd(payload?.transferAmount ?? 0)}`,
          detail: 'Đơn đã thanh toán trước đó. Cần kiểm tra và hoàn tiền cho khách nếu chuyển dư.',
          orderId: order.id,
          dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
        client,
      )
      return { outcome: 'ALREADY_PAID', orderId: order.id }
    }

    if (order.status !== 'AWAITING_PAYMENT') {
      // EXPIRED (the customer paid a few minutes late) or CANCELLED.
      await todoRepo.create(
        shopId,
        {
          title: `Đơn ${order.payment_code} đã ${order.status === 'EXPIRED' ? 'hết hạn' : 'bị hủy'}, khách vẫn chuyển ${formatVnd(payload?.transferAmount ?? 0)}`,
          detail: 'Tiền đã vào tài khoản. Xử lý tay: xác nhận lại đơn hoặc hoàn tiền cho khách.',
          orderId: order.id,
          dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
        client,
      )
      return { outcome: 'LATE_PAYMENT', orderId: order.id, orderStatus: order.status }
    }

    const paid = await applyPaid(shopId, order, { ...payload, sepayId: payload?.id }, client)
    if (!paid) {
      return { outcome: 'RACE_LOST', orderId: order.id }
    }

    return { outcome: 'PAID', orderId: order.id, amount: money(payload?.transferAmount ?? 0) }
  })
}

/** Exposed for the expiry sweep and tests: the state a transfer sees on an order. */
export const __internal = { applyPaid, seller, firstMessaging }
