// Table `messages`. Schema source: db/migrations/*.sql.
// role: user | assistant | tool. mid is the Meta message id used for dedupe.
import { defineModel, createdAt, opt, text, unique, uuid, uuidPk } from '../../lib/entityColumns.js'

export const Message = defineModel('Message', 'messages', {
  id:               uuidPk(),
  conversation_id:  uuid(),
  mid:              unique(opt(text())),
  role:             text(),
  content:          opt(text()),
  created_at:       createdAt(),
})
