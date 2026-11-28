import { mockOrders } from './mock'
import { httpOrders } from './http'
import { isReal } from '@/lib/realApi'
import type { OrdersApi } from './types'
export const ordersApi: OrdersApi = isReal('orders') ? httpOrders : mockOrders
export * from './types'
