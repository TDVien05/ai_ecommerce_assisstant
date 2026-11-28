// Table `todos`. Schema source: db/migrations/*.sql.
// status: OPEN | DONE | DISMISSED (default OPEN).
import { defineModel, createdAt, opt, text, ts, uuid, uuidPk } from '../../lib/entityColumns.js'

export const Todo = defineModel('Todo', 'todos', {
  id:          uuidPk(),
  shop_id:     uuid(),
  title:       text(),
  detail:      opt(text()),
  status:      text(),
  due_at:      opt(ts()),
  order_id:    opt(uuid()),
  created_at:  createdAt(),
})
