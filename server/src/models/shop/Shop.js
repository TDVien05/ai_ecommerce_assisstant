// Table `shops`. Schema source: db/migrations/*.sql.
// fb_page_token is stored encrypted; never log it.
import { defineModel, bool, createdAt, opt, text, ts, unique, uuidPk } from '../../lib/entityColumns.js'

export const Shop = defineModel('Shop', 'shops', {
  id:                   uuidPk(),
  name:                 text(),
  fb_page_id:           unique(opt(text())),
  fb_page_token:        opt(text()),
  bank_code:            opt(text()),
  bank_account_number:  opt(text()),
  bank_account_name:    opt(text()),
  created_at:           createdAt(),
  is_demo:              bool(),
  demo_expires_at:      opt(ts()),
})
