import { randomUUID, randomBytes } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import { appError } from '../../../errors/index.js'
import * as orderRepo from '../../../repositories/assistant/changeOrder.js'
import * as resourceRepo from '../../../repositories/assistant/changeResources.js'
import { seal, open } from './change-resources.js'

const uuid=z.string().uuid(), text=(n)=>z.string().trim().min(1).max(n)
const shipping=z.object({shippingName:text(200).nullable().optional(),shippingPhone:text(40).nullable().optional(),shippingAddress:text(500).nullable().optional()}).strict()
export const orderOperations = [
  z.object({entity:z.literal('orders'),action:z.literal('create'),data:shipping.extend({customerId:uuid,items:z.array(z.object({productId:uuid,quantity:z.number().int().min(1).max(10000)}).strict()).min(1).max(20),shippingFee:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional()}).strict()}).strict(),
  z.object({entity:z.literal('orders'),action:z.literal('update'),id:uuid,data:shipping.refine((v)=>Object.keys(v).length>0)}).strict(),
]
const conflict=()=>appError('STEP_CONFLICT','Đơn hàng đã thay đổi; không thể thực hiện thao tác.')
const missing=()=>appError('ORDER_NOT_FOUND','Không tìm thấy đơn hoặc dữ liệu liên quan.')
const clone=(v)=>JSON.parse(JSON.stringify(v))
const dbFields={shippingName:'shipping_name',shippingPhone:'shipping_phone',shippingAddress:'shipping_address'}
const mapped=(data)=>Object.fromEntries(Object.entries(data).map(([k,v])=>[dbFields[k]??k,v]))
async function priced(shopId,data,client,lock=false) {
  if (!await resourceRepo.find(shopId,'customers',data.customerId,client,lock)) throw missing()
  if (new Set(data.items.map((item)=>item.productId)).size!==data.items.length) throw appError('BAD_REQUEST','Sản phẩm trùng trong đơn.')
  const products=[];let subtotal=0
  for(const item of [...data.items].sort((a,b)=>a.productId.localeCompare(b.productId))) {
    const row=await resourceRepo.find(shopId,'products',item.productId,client,lock)
    if (!row || !row.is_active) throw missing()
    if (!Number.isSafeInteger(Number(row.price)) || !Number.isSafeInteger(Number(row.cost))) throw appError('BAD_REQUEST','Giá sản phẩm vượt giới hạn.')
    const amount=Number(row.price)*item.quantity
    if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(subtotal+amount)) throw appError('BAD_REQUEST','Tổng tiền vượt giới hạn.')
    subtotal+=amount;products.push({id:row.id,name:row.name,price:Number(row.price),cost:Number(row.cost),quantity:item.quantity})
  }
  const shippingFee=data.shippingFee??0,total=subtotal+shippingFee
  if(!Number.isSafeInteger(total))throw appError('BAD_REQUEST','Tổng tiền vượt giới hạn.')
  return {products,subtotal,shippingFee,total}
}
export const orderChange={
  name:'change_order_details',entity:'orders',schema:z.object({operation:z.enum(['create','update']),id:uuid,data:z.record(z.string(),z.unknown())}).strict(),
  async propose(change,ctx) {
    const id=change.id??randomUUID()
    const expected=change.action==='create' ? await priced(ctx.shopId,change.data) : await orderRepo.find(ctx.shopId,id)
    if(!expected)throw missing()
    return {tool:this.name,input:{operation:change.action,id,data:change.data},expected:clone(expected)}
  },
  describe(action) {
    if(action.input.operation==='create') return {steps:[{label:`Tạo đơn chờ thanh toán · ${action.expected.total.toLocaleString('vi-VN')} ₫`,meta:action.expected.products.map((p)=>`${p.name} · ${p.quantity} × ${p.price.toLocaleString('vi-VN')} ₫`).join('; '),status:'needs'}]}
    const details=Object.entries(action.input.data).map(([key,value])=>`${key}: ${action.expected[dbFields[key]]??'—'} → ${value??'—'}`).join('; ')
    return {steps:[{label:`Đơn ${action.expected.payment_code}: sửa thông tin giao`,meta:details,status:'needs'}]}
  },
  async apply(client,input,ctx,expected) {
    const operation=input.operation==='create'?{entity:'orders',action:'create',data:input.data}:{entity:'orders',action:'update',id:input.id,data:input.data}
    if(!z.union(orderOperations).safeParse(operation).success)throw appError('BAD_REQUEST','Thông tin đơn không hợp lệ.')
    if(input.operation==='create') {
      if(await orderRepo.find(ctx.shopId,input.id,client,true))throw conflict()
      const pricedNow=await priced(ctx.shopId,input.data,client,true)
      if(!isDeepStrictEqual(pricedNow,expected))throw conflict()
      await orderRepo.create(ctx.shopId,{...input.data,id:input.id,code:`DH${randomBytes(8).toString('hex').toUpperCase()}`,...pricedNow},pricedNow.products,client)
      const row=await orderRepo.find(ctx.shopId,input.id,client,true)
      return {before:null,after:seal(clone(row))}
    }
    const current=await orderRepo.find(ctx.shopId,input.id,client,true)
    if(!current || !isDeepStrictEqual(clone(current),expected))throw conflict()
    await orderRepo.updateShipping(ctx.shopId,input.id,mapped(input.data),client)
    return {before:seal(clone(current)),after:seal(clone(await orderRepo.find(ctx.shopId,input.id,client,true)))}
  },
  async revert(client,log,ctx) {
    const after=open(log.after),before=log.before?open(log.before):null,current=await orderRepo.find(ctx.shopId,after.id,client,true)
    if(!current || !isDeepStrictEqual(clone(current),after))throw conflict()
    if(!before) { if(!await orderRepo.removeCreated(ctx.shopId,after.id,client))throw conflict();return }
    await orderRepo.updateShipping(ctx.shopId,after.id,{shipping_name:before.shipping_name,shipping_phone:before.shipping_phone,shipping_address:before.shipping_address},client)
  },
}
