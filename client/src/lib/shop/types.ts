/**
 * Endpoint, hình dạng và mã lỗi là đề xuất cần server xác nhận.
 * Method | Path | Request | Response | Lỗi
 * GET | /api/shop | — | { shop: ShopSettings } | 401, 404
 * PATCH | /api/shop | Partial<ShopSettings> | { shop: ShopSettings } | 400, 401, 404
 * Không trả token hoặc bí mật qua API này.
 */
export type ShopSettings = { name: string; bankCode: string | null; bankAccountNumber: string | null; bankAccountName: string | null }
export interface ShopApi {
  get(): Promise<{ shop: ShopSettings }>
  update(body: Partial<ShopSettings>): Promise<{ shop: ShopSettings }>
}
