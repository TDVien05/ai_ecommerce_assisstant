// Table `assistant_messages`. Schema source: db/migrations/*.sql.
// Primary key (shop_id, id). conversation_id is 'hub' or an assistant thread id.
import { defineModel, createdAt, json, key, serial, text, updatedAt, uuid } from '../../lib/entityColumns.js'

export const AssistantMessage = defineModel('AssistantMessage', 'assistant_messages', {
  shop_id:          key(uuid()),
  id:               key(text()),
  conversation_id:  text(),
  role:             text(),
  body:             json(),
  seq:              serial(),
  created_at:       createdAt(),
  updated_at:       updatedAt(),
})
