import { randomUUID, randomBytes, createCipheriv, createDecipheriv, createHmac } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import { env } from '../../../config/env.js'
import { appError } from '../../../errors/index.js'
import * as resources from '../../../repositories/assistant/changeResources.js'

const text = (length) => z.string().trim().min(1).max(length)
const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const uuid = z.string().uuid()
const product = z.object({ name:text(200), sku:text(100).nullable().optional(), description:text(1000).nullable().optional(), price:money, cost:money.optional(), stock:z.number().int().min(0).max(2147483647).optional() }).strict()
const customer = z.object({ name:text(200), phone:text(40).nullable().optional(), address:text(500).nullable().optional() }).strict()
const todo = z.object({ title:text(200), detail:text(1000).nullable().optional(), dueAt:z.string().datetime({offset:true}).nullable().optional() }).strict()
const patch = (schema) => schema.partial().strict().refine((v) => Object.keys(v).length > 0)
export const resourceOperations = [
  z.object({entity:z.literal('products'),action:z.literal('create'),data:product}).strict(),
  z.object({entity:z.literal('products'),action:z.literal('update'),id:uuid,data:patch(product)}).strict(),
  z.object({entity:z.literal('products'),action:z.literal('delete'),id:uuid}).strict(),
  z.object({entity:z.literal('customers'),action:z.literal('create'),data:customer}).strict(),
  z.object({entity:z.literal('customers'),action:z.literal('update'),id:uuid,data:patch(customer)}).strict(),
  z.object({entity:z.literal('todos'),action:z.literal('create'),data:todo}).strict(),
  z.object({entity:z.literal('todos'),action:z.literal('update'),id:uuid,data:patch(todo.extend({status:z.enum(['OPEN','DONE','DISMISSED'])}))}).strict(),
  z.object({entity:z.literal('todos'),action:z.literal('delete'),id:uuid}).strict(),
  z.object({entity:z.literal('conversations'),action:z.literal('update'),id:uuid,data:z.object({aiPaused:z.boolean()}).strict()}).strict(),
]
const conflict = () => appError('STEP_CONFLICT', 'Dữ liệu đã thay đổi; không thể thực hiện thao tác.')
const missing = () => appError('NOT_FOUND', 'Không tìm thấy dữ liệu của cửa hàng.')
const clone = (v) => JSON.parse(JSON.stringify(v))
const fields = { dueAt:'due_at', aiPaused:'ai_paused' }
const databaseFields = (data) => Object.fromEntries(Object.entries(data).map(([key,value]) => [fields[key] ?? key,value]))
// Domain-separated key: no plaintext customer details are written to action logs.
const key = () => createHmac('sha256', env.APP_ENCRYPTION_KEY || env.JWT_SECRET).update('flowy/assistant-action-log/v1').digest()
export const seal = (value) => { const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key(),iv); const body=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]); return { sealed:Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64') } }
export const open = (value) => { const bytes=Buffer.from(value.sealed,'base64'), decipher=createDecipheriv('aes-256-gcm',key(),bytes.subarray(0,12)); decipher.setAuthTag(bytes.subarray(12,28)); return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8')) }
const editable = { products:['sku','name','description','price','cost','stock','is_active'], customers:['name','phone','address'], todos:['title','detail','status','due_at'], conversations:['ai_paused'] }
const selected = (row, entity) => Object.fromEntries(editable[entity].map((field) => [field,row[field]]))
const labels = { products:'Sản phẩm', customers:'Khách hàng', todos:'Việc cần làm', conversations:'Hội thoại' }

export const resourceChange = {
  name:'change_resource', entity:'resources', schema:z.object({entity:z.enum(['products','customers','todos','conversations']),action:z.enum(['create','update','delete']),id:uuid,data:z.record(z.string(),z.unknown()).optional()}).strict(),
  async propose(change, ctx) {
    const id=change.id ?? randomUUID(), row=change.action === 'create' ? null : await resources.find(ctx.shopId,change.entity,id)
    if (change.action !== 'create' && !row) throw missing()
    return {tool:this.name,input:{...change,id},expected:row ? clone(row) : null,entity:change.entity}
  },
  describe(action) {
    const {entity,action:operation,data={}}=action.input, previous=action.expected
    const next = operation === 'delete' ? (entity === 'products' ? 'Ngừng bán' : 'Xóa') : operation === 'create' ? 'Tạo mới' : 'Cập nhật'
    const details = Object.entries(data).map(([k,v]) => `${k}: ${previous?.[fields[k] ?? k] ?? '—'} → ${v ?? '—'}`).join('; ')
    return {steps:[{label:`${labels[entity]}: ${next}`, ...(details ? {meta:details}:{}),status:'needs'}]}
  },
  async apply(client,input,ctx,expected) {
    const { id: objectId, ...withoutId } = input
    const operation = input.action === 'create' ? withoutId : input
    if (!z.union(resourceOperations).safeParse(operation).success || !uuid.safeParse(objectId).success) throw appError('BAD_REQUEST', 'Thao tác không hợp lệ.')
    const {entity,action,id}=input, current=await resources.find(ctx.shopId,entity,id,client,true)
    if (action === 'create') {
      if (current) throw conflict()
      const data=databaseFields(input.data ?? {})
      if (entity === 'customers') data.psid=`manual:${randomUUID()}`
      const row=await resources.insert(ctx.shopId,entity,id,data,client)
      return {before:null,after:seal({entity,row:clone(row),action})}
    }
    if (!current || !isDeepStrictEqual(clone(current),expected)) throw conflict()
    if (action === 'delete' && entity === 'todos') {
      await resources.remove(ctx.shopId,entity,id,client)
      return {before:seal({entity,row:clone(current),action}),after:null}
    }
    const data=action === 'delete' ? {is_active:false} : databaseFields(input.data ?? {})
    const after=await resources.update(ctx.shopId,entity,id,data,client)
    return {before:seal({entity,row:clone(current),action}),after:seal({entity,row:clone(after),action})}
  },
  async revert(client,log,ctx) {
    const before=log.before ? open(log.before) : null, after=log.after ? open(log.after) : null
    const item=after ?? before, current=await resources.find(ctx.shopId,item.entity,item.row.id,client,true)
    if (!after) { if (current) throw conflict(); await resources.restoreTodo(ctx.shopId,before.row,client); return }
    if (!current || !isDeepStrictEqual(clone(current),after.row)) throw conflict()
    if (!before) { if (!await resources.remove(ctx.shopId,item.entity,item.row.id,client)) throw conflict(); return }
    if (!await resources.update(ctx.shopId,item.entity,item.row.id,selected(before.row,item.entity),client)) throw conflict()
  },
}
