import { query } from '../../config/database.js'
import { requireShopId } from '../guard.js'

export async function files(shopId,client) {
  requireShopId(shopId)
  const {rows}=await query('SELECT id,name,mime,size,created_at FROM assistant_files WHERE shop_id=$1 ORDER BY created_at DESC LIMIT 100',[shopId],client)
  return rows
}
export async function imports(shopId,client) {
  requireShopId(shopId)
  const {rows}=await query(`SELECT s.id,s.state,s.conversation_id,s.created_at,s.decided_at,
      COALESCE(marker.file_id,legacy.file_id) AS file_id, COALESCE(marker.name,legacy.name) AS name
    FROM assistant_steps s
    LEFT JOIN LATERAL (
      SELECT f.id AS file_id,f.name FROM jsonb_array_elements(s.actions) a
      JOIN assistant_files f ON f.shop_id=s.shop_id AND f.id::text=a->'input'->>'fileId'
      WHERE a->>'tool'='statement_marker' LIMIT 1
    ) marker ON true
    LEFT JOIN LATERAL (
      SELECT f.id AS file_id,f.name FROM assistant_threads t
      JOIN assistant_messages m ON m.shop_id=t.shop_id AND m.conversation_id='hub' AND m.body->>'threadId'=t.id
      JOIN assistant_files f ON f.shop_id=m.shop_id AND m.body->'attachmentIds' ? f.id::text
      WHERE t.shop_id=s.shop_id AND t.id=s.conversation_id AND t.title='Nhập sao kê'
        AND EXISTS(SELECT 1 FROM jsonb_array_elements(s.actions) a WHERE a->>'tool'='add_ledger_entries')
        AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s.actions) a WHERE a->>'tool'<>'add_ledger_entries') LIMIT 1
    ) legacy ON true
    WHERE s.shop_id=$1 AND (marker.file_id IS NOT NULL OR legacy.file_id IS NOT NULL)
    ORDER BY s.created_at DESC LIMIT 100`,[shopId],client)
  return rows
}
export async function findImport(shopId,stepId,client) {
  const items=await imports(shopId,client)
  return items.find((item)=>item.id===stepId)??null
}
export async function activeMarker(shopId,digest,client,excludeId=null,includeWaiting=false) {
  requireShopId(shopId)
  const {rows}=await query(`SELECT s.id FROM assistant_steps s WHERE s.shop_id=$1 AND s.id IS DISTINCT FROM $3::uuid
    AND (s.state='done' OR ($4::boolean AND s.state='waiting'))
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(s.actions) a WHERE a->>'tool'='statement_marker' AND a->'input'->>'digest'=$2) LIMIT 1`,[shopId,digest,excludeId,includeWaiting],client)
  return rows[0]??null
}
export async function reconcile(shopId,rows,client) {
  requireShopId(shopId)
  const {rows:result}=await query(`SELECT r.idx, count(l.id)::int AS matches
    FROM jsonb_to_recordset($2::jsonb) AS r(idx integer,day text,amount bigint)
    LEFT JOIN ledger_entries l ON l.shop_id=$1 AND l.occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh' >= r.day::date
      AND l.occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh' < r.day::date + interval '1 day'
      AND l.amount=abs(r.amount) AND l.type=CASE WHEN r.amount>0 THEN 'INCOME' ELSE 'EXPENSE' END
    GROUP BY r.idx ORDER BY r.idx`,[shopId,JSON.stringify(rows.map((row)=>({idx:row.index,day:row.date,amount:row.amount})))],client)
  return result
}
export async function restoreLogs(shopId,stepId,ids,client) {
  requireShopId(shopId)
  const result=await query('UPDATE assistant_action_log SET undone_at=NULL WHERE shop_id=$1 AND step_id=$2 AND id=ANY($3::uuid[]) AND undone_at IS NOT NULL',[shopId,stepId,ids],client)
  return result.rowCount===ids.length
}
