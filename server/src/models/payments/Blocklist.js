// Table `blocklist`. Schema source: db/migrations/*.sql.
// kind: PSID | PHONE | BANK_ACCOUNT. Unique per (shop_id, kind, value).
import { defineModel, createdAt, opt, text, uuid, uuidPk } from '../../lib/entityColumns.js'

export const Blocklist = defineModel('Blocklist', 'blocklist', {
  id:          uuidPk(),
  shop_id:     uuid(),
  kind:        text(),
  value:       text(),
  reason:      opt(text()),
  created_at:  createdAt(),
})
