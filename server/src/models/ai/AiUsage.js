// Table `ai_usage`. Schema source: db/migrations/*.sql.
import { defineModel, createdAt, int, opt, serialPk, text, uuid } from '../../lib/entityColumns.js'

export const AiUsage = defineModel('AiUsage', 'ai_usage', {
  id:                 serialPk(),
  shop_id:            opt(uuid()),
  role:               opt(text()),
  model:              opt(text()),
  prompt_tokens:      int(),
  completion_tokens:  int(),
  created_at:         createdAt(),
})
