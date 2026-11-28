// Table `agent_run_events`. Schema source: db/migrations/*.sql.
import { defineModel, createdAt, int, json, serialPk, text, uuid } from '../../lib/entityColumns.js'

export const AgentRunEvent = defineModel('AgentRunEvent', 'agent_run_events', {
  id:          serialPk(),
  run_id:      uuid(),
  seq:         int(),
  type:        text(),
  payload:     json(),
  created_at:  createdAt(),
})
