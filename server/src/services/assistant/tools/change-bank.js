import { z } from 'zod'
import { appError } from '../../../errors/index.js'
import { getShopSettings, updateShopSettings } from '../../shop/shop.service.js'
import { seal, open } from './change-resources.js'
import { env } from '../../../config/env.js'

export const bankOperation = z.object({entity:z.literal('bank'),action:z.literal('update'),data:z.object({bankCode:z.string().regex(/^[A-Za-z0-9]{2,20}$/),bankAccountNumber:z.string().regex(/^\d{5,32}$/),bankAccountName:z.string().trim().min(1).max(120)}).strict()}).strict()
const conflict=()=>appError('STEP_CONFLICT','Thông tin tài khoản đã thay đổi; không thể thực hiện thao tác.')
const same=(a,b)=>a.bankCode===b.bankCode && a.bankAccountNumber===b.bankAccountNumber && a.bankAccountName===b.bankAccountName
const bankOnly=(s)=>({bankCode:s.bankCode,bankAccountNumber:s.bankAccountNumber,bankAccountName:s.bankAccountName})
export const bankChange={
  name:'change_bank_account',entity:'bank',requiresPassword:true,schema:z.object({sealed:z.string().min(1)}).strict(),
  async propose(change,ctx) {
    if(!env.ASSISTANT_SENSITIVE_ENABLED)throw appError('TOOL_NOT_ALLOWED','Chức năng đổi tài khoản nhận tiền chưa sẵn sàng.')
    const data=change.data
    if (!ctx.ownerText || ![data.bankCode,data.bankAccountNumber,data.bankAccountName].every((v)=>ctx.ownerText.includes(v))) throw appError('BAD_REQUEST','Mã ngân hàng, số và tên tài khoản phải có trong tin nhắn của bạn ở lượt này.')
    const old=bankOnly(await getShopSettings(ctx.shopId))
    return {tool:this.name,input:seal(data),expected:seal(old)}
  },
  describe() { return {steps:[{label:'Đổi tài khoản nhận tiền',meta:'Thay đổi quan trọng. Kiểm tra đầy đủ tài khoản cũ và mới, rồi nhập mật khẩu để duyệt.',status:'needs'}]} },
  details(action) {return {before:open(action.expected),after:open(action.input)}},
  async apply(client,input,ctx,expected) {
    if(!env.ASSISTANT_SENSITIVE_ENABLED)throw appError('TOOL_NOT_ALLOWED','Chức năng đổi tài khoản nhận tiền chưa sẵn sàng.')
    const before=open(expected),data=open(input), current=bankOnly(await getShopSettings(ctx.shopId,{client}))
    if(!same(current,before))throw conflict()
    const result=await updateShopSettings(ctx.shopId,data,{client})
    if(!same(bankOnly(result.before),before))throw conflict()
    return {before:seal(before),after:seal(bankOnly(result.after))}
  },
  async revert(client,log,ctx) {
    const before=open(log.before),after=open(log.after),current=bankOnly(await getShopSettings(ctx.shopId,{client}))
    if(!same(current,after))throw conflict()
    const result=await updateShopSettings(ctx.shopId,before,{client})
    if(!same(bankOnly(result.before),after))throw conflict()
  },
}
