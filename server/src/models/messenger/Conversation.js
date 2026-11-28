// Table `conversations`. Schema source: db/migrations/*.sql.
// One conversation per customer.
import { defineModel, bool, createdAt, unique, uuid, uuidPk } from '../../lib/entityColumns.js'

export const Conversation = defineModel('Conversation', 'conversations', {
  id:           uuidPk(),
  shop_id:      uuid(),
  customer_id:  unique(uuid()),
  ai_paused:    bool(),
  created_at:   createdAt(),
})
