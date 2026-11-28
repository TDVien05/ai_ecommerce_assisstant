// Table `customers`. Schema source: db/migrations/*.sql.
// Unique per (shop_id, psid). Never log the full phone number or address.
import { defineModel, createdAt, opt, text, uuid, uuidPk } from '../../lib/entityColumns.js'

export const Customer = defineModel('Customer', 'customers', {
  id:          uuidPk(),
  shop_id:     uuid(),
  psid:        text(),
  name:        opt(text()),
  phone:       opt(text()),
  address:     opt(text()),
  created_at:  createdAt(),
})
