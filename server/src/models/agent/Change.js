// Table `changes`. Schema source: db/migrations/*.sql.
// Change log for undo; write it only through repositories/agent/change.repository.js#recordChange (pg).
import { defineModel, createdAt, json, opt, serialPk, text, uuid } from '../../lib/entityColumns.js'

export const Change = defineModel('Change', 'changes', {
  id:          serialPk(),
  shop_id:     uuid(),
  run_id:      uuid(),
  entity:      text(),
  entity_id:   text(),
  action:      text(),
  before:      opt(json()),
  after:       opt(json()),
  created_at:  createdAt(),
})
