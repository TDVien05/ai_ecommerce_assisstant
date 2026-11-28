// Table `order_items`. Schema source: db/migrations/*.sql.
import { defineModel, bigint, int, json, opt, text, uuid, uuidPk } from '../../lib/entityColumns.js'

export const OrderItem = defineModel('OrderItem', 'order_items', {
  id:             uuidPk(),
  order_id:       uuid(),
  product_id:     opt(uuid()),
  name_snapshot:  text(),
  variant:        json(),
  unit_price:     bigint(),
  unit_cost:      bigint(),
  quantity:       int(),
})
