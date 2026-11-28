import { pool } from './pool.js'
export async function saveFile(shopId,name,content,client=pool) { const {rows}=await client.query("INSERT INTO assistant_files (shop_id,name,mime,size,content) VALUES ($1,$2,'text/csv',$3,$4) RETURNING id,name",[shopId,name,content.length,content]);return rows[0] }
export async function getFile(shopId,id,client=pool) { const {rows}=await client.query('SELECT id,name,content FROM assistant_files WHERE shop_id=$1 AND id=$2',[shopId,id]);return rows[0] ?? null }
