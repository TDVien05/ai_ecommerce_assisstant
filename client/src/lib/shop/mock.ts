import { ApiError } from '@/lib/api'
import { localFixture } from '@/lib/mockServer/localFixture'
import type { ShopApi, ShopSettings } from './types'
let shop: ShopSettings = structuredClone(localFixture.shop ?? { name: '', bankCode: null, bankAccountNumber: null, bankAccountName: null })
export const mockShop: ShopApi = {
  async get() { return { shop: structuredClone(shop) } },
  async update(body) {
    if (body.name !== undefined && !body.name.trim()) throw new ApiError(400, 'BAD_REQUEST', 'Nhập tên cửa hàng.')
    shop = { ...shop, ...body }
    return { shop: structuredClone(shop) }
  },
}
