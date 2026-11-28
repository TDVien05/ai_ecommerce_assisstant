// Table `pins`. Schema source: db/migrations/*.sql.
import { defineModel, createdAt, text, uuid, uuidPk } from '../../lib/entityColumns.js'

export const Pin = defineModel('Pin', 'pins', {
  id:          uuidPk(),
  shop_id:     uuid(),
  kind:        text(),
  ref_id:      text(),
  created_at:  createdAt(),
})
