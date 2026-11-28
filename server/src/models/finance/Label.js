// Table `labels`. Schema source: db/migrations/*.sql.
import { defineModel, createdAt, opt, text, uuid, uuidPk } from '../../lib/entityColumns.js'

export const Label = defineModel('Label', 'labels', {
  id:          uuidPk(),
  shop_id:     uuid(),
  name:        text(),
  color:       opt(text()),
  created_at:  createdAt(),
})
