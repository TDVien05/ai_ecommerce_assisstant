// What services may use to work with the database: a transaction to pass to repository calls,
// and the health ping. Services never import config/database.js or db/ directly.
// See docs/ARCHITECTURE.md, section "Repositories".
export { withTransaction, ping } from '../config/database.js'
