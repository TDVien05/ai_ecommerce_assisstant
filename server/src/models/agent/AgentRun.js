// Table `agent_runs`. Schema source: db/migrations/*.sql.
import { defineModel, createdAt, json, opt, text, ts, updatedAt, uuid, uuidPk } from '../../lib/entityColumns.js'

export const AgentRun = defineModel('AgentRun', 'agent_runs', {
  id:               uuidPk(),
  shop_id:          uuid(),
  user_id:          opt(uuid()),
  conversation_id:  opt(uuid()),
  command:          text(),
  status:           text(),
  plan:             opt(json()),
  result:           opt(json()),
  error:            opt(text()),
  created_at:       createdAt(),
  updated_at:       updatedAt(),
  finished_at:      opt(ts()),
})
