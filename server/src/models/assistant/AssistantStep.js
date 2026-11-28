// Table `assistant_steps`. Schema source: db/migrations/*.sql.
// Approve and undo stay on pg (services/assistant/approval.js): they run in one transaction.
import { defineModel, createdAt, json, opt, text, ts, uuid, uuidPk } from '../../lib/entityColumns.js'

export const AssistantStep = defineModel('AssistantStep', 'assistant_steps', {
  id:               uuidPk(),
  shop_id:          uuid(),
  conversation_id:  text(),
  message_id:       text(),
  state:            text(),
  view:             json(),
  actions:          json(),
  created_at:       createdAt(),
  decided_at:       opt(ts()),
})
