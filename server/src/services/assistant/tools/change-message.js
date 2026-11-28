import { z } from 'zod'
import { appError } from '../../../errors/index.js'
import * as conversations from '../../../repositories/messenger/conversation.repository.js'

export const draftText=z.string().trim().min(1).max(2000).refine((value)=>!/(?<!\d)\d{5,32}(?!\d)/.test(value),'Không đưa dãy số nhạy cảm vào bản nháp.')
export const messageOperation=z.object({entity:z.literal('customer_message'),action:z.literal('create'),data:z.object({text:draftText}).strict()}).strict()

// Integration point for Viên. It cannot report delivery until a durable,
// idempotent send workflow exists; it does not contact Messenger.
export async function sendCustomerMessage(_shopId,_conversationId,_text) { return {sent:false} }

export const messageChange={
  name:'send_customer_message',entity:'customer_message',standalone:true,messageDraft:true,
  schema:z.object({text:draftText,conversationId:z.string().uuid().nullable()}).strict(),
  async propose(change) { return {tool:this.name,input:{text:change.data.text,conversationId:null}} },
  describe() {return {steps:[{label:'Tin nhắn gửi khách',meta:'Bạn chọn người nhận, sửa nội dung và duyệt. Tin đã gửi không thể hoàn tác.',status:'needs'}]}},
  async apply(client,input,ctx) {
    if(!input.conversationId || !await conversations.findById(ctx.shopId,input.conversationId,client))throw appError('BAD_REQUEST','Bạn cần chọn hội thoại của cửa hàng.')
    const result=await sendCustomerMessage(ctx.shopId,input.conversationId,input.text)
    if(!result.sent)throw appError('ASSISTANT_UNAVAILABLE','Chưa gửi được tin nhắn vì Messenger chưa kết nối.')
    // Sending is intentionally disabled until the integration is idempotent.
    throw appError('ASSISTANT_UNAVAILABLE','Chưa gửi được tin nhắn vì Messenger chưa kết nối.')
  },
  async revert() {throw appError('STEP_CONFLICT','Tin đã gửi không thể hoàn tác.')},
}
