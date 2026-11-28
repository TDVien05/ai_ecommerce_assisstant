// Table `shops`. Schema source: db/migrations/*.sql.
// fb_page_token and sepay_webhook_secret are stored encrypted; never log them.
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
  sepay_webhook_secret: opt(text()),
  payment_provider:     opt(text()),
})
