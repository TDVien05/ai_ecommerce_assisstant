/**
 * Every repo function takes the shop id first. This guards the one rule that keeps
 * tenants apart: a request without a shop never reaches SQL.
 */
export function requireShopId(shopId) {
  if (typeof shopId !== 'string' || shopId.trim() === '') {
    throw new Error('shopId is required by every repository function')
  }
  return shopId
}
