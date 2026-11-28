import { z } from 'zod'
import { appError } from '../../../errors/index.js'
import * as history from '../../../repositories/assistant/statementHistory.js'
import * as files from '../../../repositories/assistant/assistantFile.repository.js'
import { readStatement } from '../statement-io.js'
import { classifyRows, maskStatementText } from '../statement.js'
import { undoStatementImport } from './statement-undo.js'

const uuid=z.string().uuid()
const input=z.union([
  z.object({action:z.literal('history')}).strict(),
  z.object({action:z.enum(['preview','reconcile','import']),fileId:uuid}).strict(),
  z.object({action:z.literal('undo'),stepId:uuid}).strict(),
])
const columns=[{key:'date',label:'Ngày',kind:'date'},{key:'description',label:'Nội dung',kind:'text'},{key:'amount',label:'Số tiền',kind:'money'},{key:'reference',label:'Mã tham chiếu',kind:'text'}]
export const statementTool={
  name:'statement',tier:'write',schema:input,
  description:'Lịch sử tệp và lần nhập, xem trước hoặc đối chiếu sao kê với sổ; đề xuất nhập hoặc hoàn tác một lần nhập. Chỉ báo khớp theo ngày và số tiền, không sửa giao dịch ngân hàng hay gán đơn.',
  async run(input,ctx) {
    if(input.action==='history') {
      const [uploaded,imports]=await Promise.all([history.files(ctx.shopId),history.imports(ctx.shopId)])
      return {action:'history',files:uploaded.map((f)=>({id:f.id,name:maskStatementText(f.name),createdAt:f.created_at})),imports:imports.map((item)=>({stepId:item.id,fileId:item.file_id,name:maskStatementText(item.name),state:item.state,createdAt:item.created_at}))}
    }
    const {file,rows,warnings}=await readStatement(ctx.shopId,input.fileId,ctx)
    const matches=input.action==='reconcile' ? await history.reconcile(ctx.shopId,rows) : null
    const countByIndex=new Map((matches??[]).map((item)=>[item.idx,item.matches]))
    const viewRows=rows.map((row)=>[row.date,row.description,row.amount,row.reference,...(matches?[countByIndex.get(row.index)===1?'Khớp theo ngày và số tiền':countByIndex.get(row.index)===0?'Chưa khớp':'Nhiều khoản trùng, cần kiểm tra']:[])])
    const modelRows=rows.map((row)=>[row.date,'[Nội dung tệp ẩn khỏi mô hình]',row.amount,null,...(matches?[countByIndex.get(row.index)??0]:[])])
    const name=maskStatementText(file.name)
    return {action:input.action,fileId:file.id,name,columns:matches?[...columns,{key:'match',label:'Đối chiếu',kind:'text'}]:columns,rows:viewRows,modelRows,warnings,source:`Sao kê ${name}`,how:matches?'So ngày Việt Nam, chiều thu/chi và số tiền với sổ; kết quả chỉ gợi ý kiểm tra, không gán giao dịch.':'Dòng hợp lệ trong tệp; các dãy số tài khoản dạng thông dụng đã che.'}
  },
  async propose(input,ctx) {
    if(input.action==='undo')return [await undoStatementImport.propose({targetStepId:input.stepId},ctx)]
    if(input.action!=='import')throw appError('BAD_REQUEST','Thao tác sao kê không hợp lệ.')
    const {file,rows,digest}=await readStatement(ctx.shopId,input.fileId,ctx)
    if(await history.activeMarker(ctx.shopId,digest,undefined,null,true) || await files.activeFileImport(ctx.shopId,file.content))throw appError('DUPLICATE_FILE','Tệp này đã có lần nhập hoặc đang chờ duyệt.')
    const classification=await classifyRows(rows,ctx)
    const entries=rows.map((row)=>{const item=classification.find((value)=>value.index===row.index);return {type:row.amount>0?'INCOME':'EXPENSE',kind:item?.kind??null,channel:'BANK',category:item?.category??'OTHER',amount:Math.abs(row.amount),occurredAt:new Date(`${row.date}T12:00:00+07:00`).toISOString(),note:row.description,documentRef:row.reference,documentDate:null,industry:null}})
    const actions=[{tool:'statement_marker',input:{fileId:file.id,digest,name:maskStatementText(file.name)}}]
    for(let i=0;i<entries.length;i+=20)actions.push({tool:'add_ledger_entries',input:{entries:entries.slice(i,i+20)}})
    return actions
  },
}
