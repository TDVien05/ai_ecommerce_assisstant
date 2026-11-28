import { pool } from './pool.js'
export async function lockFileImport(shopId,id,client) { await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${shopId}:statement:${id}`]) }
export async function createThread(shopId,thread,client) {
  await client.query('INSERT INTO assistant_threads (shop_id,id,title,status,scope) VALUES ($1,$2,$3,$4,$5)',[shopId,thread.id,thread.title,thread.status,thread.scope])
}
export async function getThread(shopId,id,client=pool,lock=false) {
  const {rows}=await client.query(`SELECT id,title,status,scope,updated_at FROM assistant_threads WHERE shop_id=$1 AND id=$2${lock ? ' FOR UPDATE' : ''}`,[shopId,id]); return rows[0] ?? null
}
export async function setThread(shopId,id,status,client) {
  const {rows}=await client.query('UPDATE assistant_threads SET status=$3,updated_at=now() WHERE shop_id=$1 AND id=$2 RETURNING id,title,status,scope,updated_at',[shopId,id,status]); return rows[0] ?? null
}
export async function setSummary(shopId,id,message,client) {
  await client.query('UPDATE assistant_messages SET body=$3,updated_at=now() WHERE shop_id=$1 AND id=$2',[shopId,id,message])
}
export async function usedFile(shopId,id,client) {
  const {rowCount}=await client.query("SELECT 1 FROM assistant_messages WHERE shop_id=$1 AND body->'attachmentIds' ? $2 LIMIT 1",[shopId,id]);return rowCount>0
}
