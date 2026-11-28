// Table `products`. Schema source: db/migrations/*.sql.
// price and cost are integer VND.
import { defineModel, bigint, bool, createdAt, int, json, opt, text, uuid, uuidPk } from '../../lib/entityColumns.js'

export const Product = defineModel('Product', 'products', {
  id:           uuidPk(),
  shop_id:      uuid(),
  sku:          opt(text()),
  name:         text(),
  description:  opt(text()),
  price:        bigint(),
  cost:         bigint(),
  stock:        int(),
  variants:     json(),
  image_url:    opt(text()),
  is_active:    bool(),
  created_at:   createdAt(),
})
