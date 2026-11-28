// Table `assistant_threads`. Schema source: db/migrations/*.sql.
// Primary key (shop_id, id); id is chosen by the server (e.g. alert-<uuid>).
import { defineModel, createdAt, key, text, updatedAt, uuid } from '../../lib/entityColumns.js'

export const AssistantThread = defineModel('AssistantThread', 'assistant_threads', {
  id:          key(text()),
  shop_id:     key(uuid()),
  title:       text(),
  status:      text(),
  scope:       text(),
  created_at:  createdAt(),
  updated_at:  updatedAt(),
})
