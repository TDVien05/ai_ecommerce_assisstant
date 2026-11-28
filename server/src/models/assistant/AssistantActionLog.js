// Table `assistant_action_log`. Schema source: db/migrations/*.sql.
import { defineModel, json, opt, text, ts, uuid, uuidPk } from '../../lib/entityColumns.js'

export const AssistantActionLog = defineModel('AssistantActionLog', 'assistant_action_log', {
  id:          uuidPk(),
  shop_id:     uuid(),
  step_id:     uuid(),
  user_id:     uuid(),
  tool:        text(),
  before:      opt(json()),
  after:       opt(json()),
  applied_at:  ts(),
  undone_at:   opt(ts()),
})
