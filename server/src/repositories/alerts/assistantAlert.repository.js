// All queries for the `assistant_alerts` table. See docs/ARCHITECTURE.md, section "Repositories".
import { query } from '../../config/database.js'

const columns='a.id,a.shop_id,a.level,a.title,a.reasons,a.order_id,o.payment_code AS order_code,a.detected_at,a.status'

export async function list(shopId,status,client) { const {rows}=await query(`SELECT ${columns} FROM assistant_alerts a LEFT JOIN orders o ON o.id=a.order_id AND o.shop_id=a.shop_id WHERE a.shop_id=$1 AND ($2::text IS NULL OR a.status=$2) ORDER BY a.detected_at DESC,a.id`,[shopId,status??null], client); return rows }

export async function find(shopId,id,client,lock=false) { const {rows}=await query(`SELECT ${columns} FROM assistant_alerts a LEFT JOIN orders o ON o.id=a.order_id AND o.shop_id=a.shop_id WHERE a.shop_id=$1 AND a.id=$2${lock?' FOR UPDATE OF a':''}`,[shopId,id], client);return rows[0]??null }

export async function insert(shopId,id,input,client) { const result=await query(`INSERT INTO assistant_alerts (id,shop_id,level,title,reasons,order_id) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING`,[id,shopId,input.level,input.title,JSON.stringify(input.reasons),input.orderId??null], client); return result.rowCount>0 }

export async function setStatus(shopId,id,status,client) { await query('UPDATE assistant_alerts SET status=$3 WHERE shop_id=$1 AND id=$2',[shopId,id,status], client) }
