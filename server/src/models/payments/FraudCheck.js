// Table `fraud_checks`. Schema source: db/migrations/*.sql.
// level: LOW | MEDIUM | HIGH.
import { defineModel, createdAt, json, opt, serialPk, text, uuid } from '../../lib/entityColumns.js'

export const FraudCheck = defineModel('FraudCheck', 'fraud_checks', {
  id:           serialPk(),
  shop_id:      opt(uuid()),
  provider:     opt(text()),
  external_id:  opt(text()),
  level:        text(),
  rule:         text(),
  reason:       opt(text()),
  metadata:     json(),
  created_at:   createdAt(),
})
