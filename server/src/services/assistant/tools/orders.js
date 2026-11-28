import { z } from 'zod'
import { appError } from '../../../errors/index.js'
import * as orders from '../../orders/order.service.js'
const status = z.enum(['AWAITING_PAYMENT','PAID','EXPIRED','CANCELLED','SHIPPING','COMPLETED','REFUNDED'])
const code = z.string().trim().min(1).max(80)
export const listOrders = { name: 'list_orders', tier: 'read', description: 'Liệt kê đơn của cửa hàng, có thể lọc trạng thái.', schema: z.object({ status: status.optional() }).strict(), run: async (input,ctx) => ({ items: await orders.listOrders(ctx.shopId,input) }) }
export const getOrder = { name: 'get_order', tier: 'read', description: 'Xem đơn của cửa hàng theo mã thanh toán.', schema: z.object({ paymentCode: code }).strict(), run: (input,ctx) => orders.getOrder(ctx.shopId,input.paymentCode) }
export const updateOrderStatus = {
  name: 'update_order_status', tier: 'write', description: 'Đề xuất chuyển đơn sang SHIPPING, COMPLETED hoặc CANCELLED; cần duyệt.',
  schema: z.object({ paymentCode: code, status: z.enum(['SHIPPING','COMPLETED','CANCELLED']) }).strict(),
  async propose(input,ctx) { const order = await orders.getOrder(ctx.shopId,input.paymentCode); const previous = { SHIPPING:'PAID', COMPLETED:'SHIPPING', CANCELLED:'AWAITING_PAYMENT' }; if (order.status !== previous[input.status]) throw appError('ORDER_CONFLICT', 'Không thể chuyển trạng thái đơn này.'); return { tool:this.name, input, expected:{ id:order.id, status:order.status } } },
  async apply(client,input,ctx,expected) { return orders.changeStatus(ctx.shopId,input.paymentCode,input.status,expected,client) },
  async revert(client,log,ctx) { await orders.restoreStatus(ctx.shopId,log.before,log.after,client) },
}
