import { z } from 'zod'
import { appError } from '../../../errors/index.js'
import * as store from '../store.js'
import * as history from '../../../repositories/assistant/statementHistory.js'
import * as files from '../../../repositories/assistant/assistantFile.repository.js'
import * as ledger from '../../../repositories/finance/ledgerEntry.repository.js'
import * as messages from '../../../repositories/assistant/assistantMessage.repository.js'
import { addLedgerEntries } from './finance.write.js'
import { seal, open } from './change-resources.js'
import { updateThread } from '../thread-status.js'
import { digestOf } from '../statement-io.js'
import { maskStatementText } from '../statement.js'

const conflict=()=>appError('STEP_CONFLICT','Lần nhập hoặc các khoản liên quan đã thay đổi; không thể hoàn tác.')
const missing=()=>appError('STEP_NOT_FOUND','Không tìm thấy lần nhập của cửa hàng.')
const validLogs=(logs)=>logs.length>0 && logs.some((log)=>log.tool==='add_ledger_entries') && logs.every((log)=>log.tool==='add_ledger_entries' || log.tool==='statement_marker')
const sanitized=(view)=>({...view,steps:view.steps.map((step)=>({...step,label:maskStatementText(step.label),...(step.meta?{meta:maskStatementText(step.meta)}:{})})),...(view.questions?{questions:view.questions.map((q)=>({...q,label:maskStatementText(q.label)}))}:{})})
const eventsFor=(step,message,update)=>[{type:'message',conversationId:step.conversation_id,message},...(update?[{type:'thread',thread:update.thread},{type:'message',conversationId:'hub',message:update.message}]:[])]
async function metadata(shopId,id,client) {
  const record=await history.findImport(shopId,id,client)
  if(!record?.file_id)throw missing()
  const file=await files.getFile(shopId,record.file_id,client)
  if(!file)throw missing()
  return {record,file,digest:digestOf(file.content)}
}
async function noOtherImport(shopId,digest,targetId,currentId,client) {
  const other=await history.imports(shopId,client)
  for(const item of other) {
    if(item.id===targetId || item.id===currentId || !['done','waiting'].includes(item.state) || !item.file_id)continue
    const file=await files.getFile(shopId,item.file_id,client)
    if(file && digestOf(file.content)===digest)throw conflict()
  }
}
export const undoStatementImport={
  name:'undo_statement_import',entity:'ledger',standalone:true,
  schema:z.object({targetStepId:z.string().uuid()}).strict(),
  async propose(input,ctx) {
    const {record,file,digest}=await metadata(ctx.shopId,input.targetStepId)
    const step=await store.getStep(ctx.shopId,input.targetStepId),logs=await store.getLogs(ctx.shopId,input.targetStepId)
    if(!step || step.state!=='done' || !validLogs(logs))throw conflict()
    const count=logs.reduce((sum,log)=>sum+(log.after?.entries?.length??0),0)
    return {tool:this.name,input,expected:{fileId:file.id,digest,logIds:logs.map((log)=>log.id).sort(),count,name:maskStatementText(record.name)}}
  },
  describe:(action)=>({steps:[{label:`Hoàn tác lần nhập ${action.expected.name}`,meta:`Kiểm tra ${action.expected.count} khoản đã ghi trước khi duyệt.`,status:'needs'}]}),
  async apply(client,input,ctx,expected) {
    const target=await store.lockStep(ctx.shopId,input.targetStepId,client)
    if(!target || target.state!=='done')throw conflict()
    const {file,digest}=await metadata(ctx.shopId,input.targetStepId,client)
    if(file.id!==expected.fileId || digest!==expected.digest)throw conflict()
    await files.lockFileImport(ctx.shopId,digest,client)
    const logs=await store.getLogs(ctx.shopId,target.id,client)
    if(!validLogs(logs) || JSON.stringify(logs.map((log)=>log.id).sort())!==JSON.stringify(expected.logIds))throw conflict()
    const rows=logs.flatMap((log)=>log.tool==='add_ledger_entries'?log.after.entries:[])
    if(rows.length!==expected.count)throw conflict()
    for(const log of [...logs].reverse()) if(log.tool==='add_ledger_entries')await addLedgerEntries.revert(client,log,ctx)
    await store.markUndone(ctx.shopId,target.id,client)
    const originalView=sanitized(target.view)
    const previousMessage=await messages.getMessage(ctx.shopId,target.message_id,client,true)
    if(!previousMessage || !Array.isArray(previousMessage.blocks))throw conflict()
    const oldMessage=structuredClone(previousMessage)
    const index=oldMessage.blocks.findIndex((block)=>block.type==='agentStep'&&block.stepId===target.id)
    if(index<0)throw conflict()
    oldMessage.blocks[index]=originalView
    const view={...originalView,state:'undone',doneText:'Đã hoàn tác các khoản từ sao kê.',steps:originalView.steps.map((step)=>({...step,status:'skipped'}))}
    const message=await store.saveStepAndMessage(target,view,client)
    const update=target.conversation_id==='hub'?null:await updateThread(ctx.shopId,target.conversation_id,'done','Đã hoàn tác các khoản từ sao kê.',client)
    return {before:seal({targetId:target.id,fileId:file.id,digest,logIds:expected.logIds,rows,originalView,events:eventsFor(target,oldMessage,null)}),after:seal({events:eventsFor(target,message,update)})}
  },
  async revert(client,log,ctx) {
    const before=open(log.before),target=await store.lockStep(ctx.shopId,before.targetId,client)
    if(!target || target.state!=='undone')throw conflict()
    const file=await files.getFile(ctx.shopId,before.fileId,client)
    if(!file || digestOf(file.content)!==before.digest)throw conflict()
    await files.lockFileImport(ctx.shopId,before.digest,client)
    if(await files.activeFileImport(ctx.shopId,file.content,client,target.conversation_id))throw conflict()
    if(await history.activeMarker(ctx.shopId,before.digest,client,target.id,true))throw conflict()
    await noOtherImport(ctx.shopId,before.digest,target.id,ctx.stepId,client)
    for(const row of before.rows) {
      if(row.shop_id!==ctx.shopId || await ledger.findEntry(ctx.shopId,row.id,client,true))throw conflict()
      await ledger.restoreEntry(row,client)
    }
    if(!await history.restoreLogs(ctx.shopId,target.id,before.logIds,client))throw conflict()
    await store.saveStepAndMessage(target,before.originalView,client)
    if(target.conversation_id!=='hub')await updateThread(ctx.shopId,target.conversation_id,'done','Đã khôi phục các khoản từ sao kê.',client)
  },
  events:(snapshot)=>open(snapshot).events,
}
