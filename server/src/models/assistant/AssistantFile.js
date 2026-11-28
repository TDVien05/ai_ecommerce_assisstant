// Table `assistant_files`. Schema source: db/migrations/*.sql.
// Uploaded statement files, at most 2 MB.
import { defineModel, bytes, createdAt, int, text, uuid, uuidPk } from '../../lib/entityColumns.js'

export const AssistantFile = defineModel('AssistantFile', 'assistant_files', {
  id:          uuidPk(),
  shop_id:     uuid(),
  name:        text(),
  mime:        text(),
  size:        int(),
  content:     bytes(),
  created_at:  createdAt(),
})
