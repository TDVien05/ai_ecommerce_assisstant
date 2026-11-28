// Table `orders`. Schema source: db/migrations/*.sql.
// Status changes stay on pg (withTransaction): they must commit together with the ledger and stock.
// No code may move an order to PAID from AI input (see docs/AI_AGENT.md).
import { defineModel, bigint, createdAt, opt, text, ts, unique, uuid, uuidPk } from '../../lib/entityColumns.js'

export const Order = defineModel('Order', 'orders', {
  id:                uuidPk(),
  shop_id:           uuid(),
  customer_id:       uuid(),
  payment_code:      unique(text()),
  status:            text(),
  subtotal:          bigint(),
  shipping_fee:      bigint(),
  total:             bigint(),
  shipping_name:     opt(text()),
  shipping_phone:    opt(text()),
  shipping_address:  opt(text()),
  expires_at:        opt(ts()),
  paid_at:           opt(ts()),
  created_at:        createdAt(),
  risk_level:        text(),
})
