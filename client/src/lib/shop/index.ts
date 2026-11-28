import { mockShop } from './mock'
import { httpShop } from './http'
import { isReal } from '@/lib/realApi'
import type { ShopApi } from './types'

/** Chọn bản thật khi VITE_REAL_API có "shop". */
export const shopApi: ShopApi = isReal('shop') ? httpShop : mockShop

export * from './types'
