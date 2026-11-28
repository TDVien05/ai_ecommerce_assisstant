// Table `ledger_entries`. Schema source: db/migrations/*.sql.
// amount is integer VND, always >= 0; type says the direction. Writes that belong with an order
// status change stay on pg (withTransaction).
import { defineModel, bigint, bool, createdAt, date, opt, text, ts, uuid, uuidPk } from '../../lib/entityColumns.js'

export const LedgerEntry = defineModel('LedgerEntry', 'ledger_entries', {
  id:               uuidPk(),
  shop_id:          uuid(),
  type:             text(),
  category:         text(),
  amount:           bigint(),
  order_id:         opt(uuid()),
  note:             opt(text()),
  occurred_at:      ts(),
  created_at:       createdAt(),
  source:           text(),
  label_id:         opt(uuid()),
  counterparty:     opt(text()),
  raw_description:  opt(text()),
  dedupe_key:       opt(text()),
  run_id:           opt(uuid()),
  kind:             opt(text()),
  channel:          opt(text()),
  document_ref:     opt(text()),
  document_date:    opt(date()),
  industry:         opt(text()),
  manual:           bool(),
})
