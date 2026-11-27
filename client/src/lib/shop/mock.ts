import { ApiError } from '@/lib/api'
import type { ShopApi, ShopSettings } from './types'
let shop: ShopSettings = { name: 'Cửa hàng mẫu', bankCode: 'VCB', bankAccountNumber: '0000000000', bankAccountName: 'CUA HANG MAU' }
export const mockShop: ShopApi = {
  async get() { return { shop: structuredClone(shop) } },
  async update(body) {
    if (body.name !== undefined && !body.name.trim()) throw new ApiError(400, 'BAD_REQUEST', 'Nhập tên cửa hàng.')
    shop = { ...shop, ...body }
    return { shop: structuredClone(shop) }
  },
}
