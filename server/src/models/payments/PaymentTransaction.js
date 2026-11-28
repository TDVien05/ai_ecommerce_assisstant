// Table `payment_transactions`. Schema source: db/migrations/*.sql.
// SePay transactions; sepay_id dedupes retries.
import { defineModel, bigint, createdAt, json, opt, text, ts, unique, uuid, uuidPk } from '../../lib/entityColumns.js'

export const PaymentTransaction = defineModel('PaymentTransaction', 'payment_transactions', {
  id:                uuidPk(),
  sepay_id:          unique(bigint()),
  gateway:           opt(text()),
  account_number:    opt(text()),
  code:              opt(text()),
  content:           opt(text()),
  reference_code:    opt(text()),
  transfer_type:     opt(text()),
  transfer_amount:   bigint(),
  transaction_date:  opt(ts()),
  order_id:          opt(uuid()),
  match_status:      opt(text()),
  raw:               json(),
  created_at:        createdAt(),
  shop_id:           opt(uuid()),
})
