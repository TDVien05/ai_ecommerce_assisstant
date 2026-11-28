import ExcelJS from 'exceljs'
import yauzl from 'yauzl'
import { appError } from '../../errors/index.js'
import { parseStatementRows } from './statement.js'

const invalid=(message)=>appError('INVALID_STATEMENT',message)
const unpackLimit=12*1024*1024, entryLimit=4*1024*1024
async function inspectArchive(buffer) {
  await new Promise((resolve,reject)=>yauzl.fromBuffer(buffer,{lazyEntries:true,validateEntrySizes:true},(error,zip)=>{
    if(error)return reject(invalid('Tệp XLSX không hợp lệ.'))
    let total=0,count=0,finished=false
    const fail=()=>{if(finished)return;finished=true;zip.close();reject(invalid('Tệp XLSX không an toàn hoặc vượt giới hạn giải nén.'))}
    zip.on('error',fail)
    zip.on('end',()=>{if(!finished){finished=true;resolve()}})
    zip.on('entry',(entry)=>{
      const name=entry.fileName.toLowerCase()
      if(++count>500 || entry.uncompressedSize>entryLimit || total+entry.uncompressedSize>unpackLimit || (entry.generalPurposeBitFlag&1) || name.includes('..') || name.includes('vbaproject') || name.startsWith('xl/externallinks/') || name.startsWith('xl/embeddings/') || name==='xl/connections.xml')return fail()
      if(name.endsWith('/'))return zip.readEntry()
      zip.openReadStream(entry,(err,stream)=>{
        if(err)return fail()
        let size=0
        stream.on('data',(chunk)=>{size+=chunk.length;if(size>entryLimit || total+size>unpackLimit){stream.destroy();fail()}})
        stream.on('error',fail)
        stream.on('end',()=>{if(finished)return;total+=size;zip.readEntry()})
      })
    })
    zip.readEntry()
  }))
}
function text(cell) {
  const value=cell.value
  if(value===null || value===undefined)return ''
  if(value instanceof Date) return Number.isNaN(value.getTime())?'':value.toISOString().slice(0,10)
  if(typeof value==='string' || typeof value==='number')return String(value)
  // Do not evaluate formulas or trust cached formula results, hyperlinks or rich objects.
  throw invalid('Tệp XLSX chỉ được chứa giá trị trực tiếp; không hỗ trợ công thức hoặc đối tượng nhúng.')
}
export async function parseStatementXlsx(buffer) {
  await inspectArchive(buffer)
  const workbook=new ExcelJS.Workbook()
  try { await workbook.xlsx.load(buffer) } catch {throw invalid('Không đọc được tệp XLSX.')}
  if(!workbook.worksheets.length || workbook.worksheets.length>10)throw invalid('Tệp XLSX không có trang tính hợp lệ.')
  const sheet=workbook.worksheets[0]
  if(sheet.rowCount>101 || sheet.columnCount>30)throw invalid('Mỗi tệp tối đa 100 dòng dữ liệu và 30 cột.')
  const records=[]
  for(let i=1;i<=sheet.rowCount;i++) {
    const row=sheet.getRow(i), values=[]
    for(let column=1;column<=sheet.columnCount;column++)values.push(text(row.getCell(column)))
    if(values.some((value)=>value.trim()))records.push(values)
  }
  const result=parseStatementRows(records)
  if(workbook.worksheets.length>1)result.warnings.push('Chỉ đọc trang tính đầu tiên.')
  return result
}
