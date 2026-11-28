import { withTransaction } from '../../repositories/database.js'
import * as orderRepo from '../../repositories/orders/order.repository.js'
import { logger } from '../../lib/logger.js'

/**
 * Expiry sweep: an order that is still AWAITING_PAYMENT past its deadline becomes EXPIRED, which
 * frees the stock that was implicitly held.
 *
 * Two safety rules:
 *  - The update is a compare-and-set on `AWAITING_PAYMENT`, so expiring can never overwrite a
 *    payment that landed in the same second.
 *  - Stock is released (added back) only when we are the one that flipped the status.
 *
 * The webhook must NOT rely on this sweep having run: docs/PAYMENT_ANTI_SCAM.md, rule 6-8, and
 * reconcile.service.js handle the "paid after expiry" case explicitly.
 */
export async function expireOverdueOrders(now = new Date(), limit = 500) {
  const candidates = await orderRepo.findAllExpired(now, limit)
  let expired = 0

  for (const order of candidates) {
    try {
      const flipped = await withTransaction(async (client) => {
        const row = await orderRepo.expireIfAwaiting(order.shop_id, order.id, client)
        if (!row) return null

        // Restock what the unpaid order was holding.
        const items = await orderRepo.findItemsForStock(order.shop_id, order.id, client)
        for (const item of items) {
          await orderRepo.restoreStock(order.shop_id, item.product_id, item.quantity, client)
        }
        return row
      })

      if (flipped) {
        expired += 1
        logger.info(
          { shopId: order.shop_id, orderId: order.id, code: order.payment_code },
          'order expired',
        )
      }
    } catch (error) {
      logger.error({ err: error, orderId: order.id }, 'failed to expire an order')
    }
  }

  return { scanned: candidates.length, expired }
}
