import { date, defineModel, int, key, opt, ts, uuid } from '../../lib/entityColumns.js'

export const AssistantProactiveState = defineModel('AssistantProactiveState', 'assistant_proactive_state', {
  shop_id: key(uuid()),
  last_opened_at: ts(),
  last_scanned_at: opt(ts()),
  ai_day: opt(date()),
  ai_calls: int(),
  revision: int(),
})
