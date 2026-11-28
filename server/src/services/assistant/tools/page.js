import { z } from 'zod'
const period=z.enum(['today','week','month'])
const page=z.union([
  z.object({page:z.literal('ledger'),filters:z.object({period:period.optional(),type:z.enum(['INCOME','EXPENSE']).optional(),tab:z.enum(['entries','templates']).optional(),code:z.enum(['S1a-HKD','S2a-HKD','S2b-HKD','S2c-HKD','S2d-HKD','S2e-HKD','S3a-HKD']).optional()}).strict().optional()}).strict(),
  z.object({page:z.literal('orders'),filters:z.object({status:z.enum(['AWAITING_PAYMENT','PAID','SHIPPING','COMPLETED','CANCELLED']).optional(),q:z.string().trim().max(100).optional()}).strict().optional()}).strict(),
  z.object({page:z.literal('reports'),filters:z.object({period:period.optional()}).strict().optional()}).strict(),
  z.object({page:z.enum(['fraud','messenger','sources','settings'])}).strict(),
])
const names={ledger:'Sổ thu chi',orders:'Đơn hàng',reports:'Báo cáo',fraud:'Cảnh báo',messenger:'Messenger',sources:'Nguồn dữ liệu',settings:'Cài đặt'}
export const pageTool={name:'open_page',tier:'read',description:'Tạo nút mở trang chức năng với bộ lọc được hỗ trợ. Không tự điều hướng.',schema:page,run:async(input)=>({page:input.page,label:`Mở ${names[input.page]}`,filters:input.page==='ledger' && input.filters?.code ? {...input.filters,tab:'templates'} : input.filters??{}})}
