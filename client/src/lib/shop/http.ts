import { api } from '@/lib/api'
import { mockShop } from './mock'
import { isReal } from '@/lib/realApi'
import type { ShopApi } from './types'

/**
 * Chọn nguồn dữ liệu cửa hàng. Server đã có GET /api/shop và PUT /api/shop,
 * nên bản thật dùng đúng path đó.
 */
export const httpShop: ShopApi = {
  get: () => api.get('/shop'),
  update: (body) => api.put('/shop', body),
}

export const shopApi: ShopApi = isReal('shop') ? httpShop : mockShop
