// Table `users`. Schema source: db/migrations/*.sql.
// password_hash is a bcrypt hash; never return it to a client.
import { defineModel, createdAt, opt, text, unique, uuid, uuidPk } from '../../lib/entityColumns.js'

export const User = defineModel('User', 'users', {
  id:             uuidPk(),
  shop_id:        uuid(),
  email:          unique(text()),
  password_hash:  text(),
  created_at:     createdAt(),
  owner_name:     opt(text()),
})
