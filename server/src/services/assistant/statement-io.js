import { createHash } from 'node:crypto'
import { getFile } from './files.js'
import { parseStatementCsv, safeStatementRows } from './statement.js'
import { parseStatementXlsx } from './statement-xlsx.js'
import { guardData } from './guard.js'

export const digestOf=(content)=>createHash('sha256').update(content).digest('hex')
export async function readStatement(shopId,fileId,ctx) {
  const file=await getFile(shopId,fileId)
  const parsed=file.name.toLowerCase().endsWith('.xlsx')?await parseStatementXlsx(file.content):parseStatementCsv(file.content)
  const rows=await Promise.all(safeStatementRows(parsed.rows).map(async(row)=>{
    const checked=await guardData(row.description,{source:'statement',channel:'owner',ctx})
    const ref=row.reference ? await guardData(row.reference,{source:'statement',channel:'owner',ctx}) : null
    return {...row,description:checked.flagged?'[Nội dung cần kiểm tra]':row.description,reference:ref?.flagged?'[Nội dung cần kiểm tra]':row.reference}
  }))
  return {file,rows,warnings:parsed.warnings,digest:digestOf(file.content)}
}
