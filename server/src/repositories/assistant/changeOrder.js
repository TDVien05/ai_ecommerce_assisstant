import { query } from '../../config/database.js'
import { requireShopId } from '../guard.js'

const columns = 'id,shop_id,customer_id,payment_code,status,subtotal,shipping_fee,total,shipping_name,shipping_phone,shipping_address,created_at'
export async function find(shopId,id,db,lock=false) {
  requireShopId(shopId)
  const {rows}=await query(`SELECT ${columns} FROM orders WHERE shop_id=$1 AND id=$2${lock?' FOR UPDATE':''}`,[shopId,id],db)
  if (!rows[0]) return null
  const items=await query('SELECT id,product_id,name_snapshot,variant,unit_price,unit_cost,quantity FROM order_items WHERE order_id=$1 ORDER BY id',[id],db)
  return {...rows[0],items:items.rows}
}
export async function create(shopId,order,items,db) {
  requireShopId(shopId)
  const {rows}=await query(`INSERT INTO orders (id,shop_id,customer_id,payment_code,status,subtotal,shipping_fee,total,shipping_name,shipping_phone,shipping_address) VALUES ($1,$2,$3,$4,'AWAITING_PAYMENT',$5,$6,$7,$8,$9,$10) RETURNING ${columns}`,[order.id,shopId,order.customerId,order.code,order.subtotal,order.shippingFee,order.total,order.shippingName??null,order.shippingPhone??null,order.shippingAddress??null],db)
  for (const item of items) await query('INSERT INTO order_items (order_id,product_id,name_snapshot,unit_price,unit_cost,quantity) VALUES ($1,$2,$3,$4,$5,$6)',[order.id,item.id,item.name,item.price,item.cost,item.quantity],db)
  return rows[0]
}
export async function updateShipping(shopId,id,data,db) {
  requireShopId(shopId)
  const allowed=['shipping_name','shipping_phone','shipping_address'], keys=Object.keys(data)
  if (!keys.length || keys.some((key)=>!allowed.includes(key))) throw new Error('Unsupported column')
  const {rows}=await query(`UPDATE orders SET ${keys.map((key,i)=>`${key}=$${i+3}`).join(',')} WHERE shop_id=$1 AND id=$2 RETURNING id`,[shopId,id,...keys.map((key)=>data[key])],db)
  return rows[0]??null
}
export async function removeCreated(shopId,id,db) {
  requireShopId(shopId)
  const result=await query("DELETE FROM orders WHERE shop_id=$1 AND id=$2 AND status='AWAITING_PAYMENT'",[shopId,id],db)
  return result.rowCount===1
}
