import { query } from '../../config/database.js'
import { requireShopId } from '../guard.js'

// Fixed table/column sets; no identifier comes from model input.
const resources = {
  products: { columns: ['id','shop_id','sku','name','description','price','cost','stock','is_active','created_at'], writable: ['sku','name','description','price','cost','stock','is_active'] },
  customers: { columns: ['id','shop_id','name','phone','address','created_at'], writable: ['name','phone','address'] },
  todos: { columns: ['id','shop_id','title','detail','status','due_at','order_id','created_at'], writable: ['title','detail','status','due_at'] },
  conversations: { columns: ['id','shop_id','ai_paused','created_at'], writable: ['ai_paused'] },
}
const spec = (entity) => { if (!Object.hasOwn(resources, entity)) throw new Error('Unsupported resource'); return resources[entity] }
export async function find(shopId, entity, id, db, lock = false) {
  requireShopId(shopId)
  const { columns } = spec(entity)
  const { rows } = await query(`SELECT ${columns.join(',')} FROM ${entity} WHERE shop_id=$1 AND id=$2${lock ? ' FOR UPDATE' : ''}`, [shopId,id], db)
  return rows[0] ?? null
}
export async function insert(shopId, entity, id, data, db) {
  requireShopId(shopId)
  const { columns, writable } = spec(entity)
  const keys = Object.keys(data)
  if (keys.some((key) => !writable.includes(key) && !(entity === 'customers' && key === 'psid'))) throw new Error('Unsupported column')
  const fields = ['shop_id','id',...keys]
  const { rows } = await query(`INSERT INTO ${entity} (${fields.join(',')}) VALUES (${fields.map((_, i) => `$${i+1}`).join(',')}) RETURNING ${columns.join(',')}`, [shopId,id,...keys.map((key) => data[key])], db)
  return rows[0]
}
export async function update(shopId, entity, id, data, db) {
  requireShopId(shopId)
  const { columns, writable } = spec(entity), keys = Object.keys(data)
  if (!keys.length || keys.some((key) => !writable.includes(key))) throw new Error('Unsupported column')
  const { rows } = await query(`UPDATE ${entity} SET ${keys.map((key,i) => `${key}=$${i+3}`).join(',')} WHERE shop_id=$1 AND id=$2 RETURNING ${columns.join(',')}`, [shopId,id,...keys.map((key) => data[key])], db)
  return rows[0] ?? null
}
export async function remove(shopId, entity, id, db) {
  requireShopId(shopId); spec(entity)
  const result = await query(`DELETE FROM ${entity} WHERE shop_id=$1 AND id=$2`, [shopId,id], db)
  return result.rowCount === 1
}
export async function restoreTodo(shopId, row, db) {
  requireShopId(shopId)
  if (row.shop_id !== shopId) throw new Error('Wrong shop')
  await query('INSERT INTO todos (id,shop_id,title,detail,status,due_at,order_id,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [row.id,shopId,row.title,row.detail,row.status,row.due_at,row.order_id,row.created_at], db)
}
