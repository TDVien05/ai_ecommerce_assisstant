import { z } from 'zod'
import { appError } from '../../../errors/index.js'
import * as files from '../../../repositories/assistant/assistantFile.repository.js'
import * as history from '../../../repositories/assistant/statementHistory.js'
import { digestOf } from '../statement-io.js'
import { maskStatementText } from '../statement.js'

const conflict=()=>appError('STEP_CONFLICT','Tệp đã được nhập hoặc đang có đề xuất khác. Hãy kiểm tra lịch sử sao kê.')
export const statementMarker={
  name:'statement_marker',entity:'ledger',countChange:false,
  schema:z.object({fileId:z.string().uuid(),digest:z.string().regex(/^[a-f0-9]{64}$/),name:z.string().min(1).max(255)}).strict(),
  describe:(action)=>({steps:[{label:`Nhập sao kê ${action.input.name}`,meta:'Chỉ ghi sổ sau khi bạn duyệt.',status:'needs'}]}),
  async apply(client,input,ctx) {
    const file=await files.getFile(ctx.shopId,input.fileId,client)
    if(!file || maskStatementText(file.name)!==input.name || digestOf(file.content)!==input.digest)throw conflict()
    await files.lockFileImport(ctx.shopId,input.digest,client)
    if(await history.activeMarker(ctx.shopId,input.digest,client,ctx.stepId) || await files.activeFileImport(ctx.shopId,file.content,client,ctx.conversationId))throw conflict()
    return {before:null,after:{fileId:input.fileId,digest:input.digest}}
  },
  async revert() {},
}
