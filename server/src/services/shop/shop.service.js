import { z } from 'zod'
import { withTransaction } from '../../repositories/database.js'
import { findShop, saveShop } from '../../repositories/shop/shop.repository.js'
import { appError, badRequest } from '../../errors/index.js'

const textOrNull = (max) => z.string().trim().min(1).max(max).nullable()
const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  bankCode: z.string().trim().regex(/^[A-Za-z0-9]{2,20}$/).transform((v) => v.toUpperCase()).nullable().optional(),
  bankAccountNumber: z.string().trim().regex(/^\d{5,32}$/).nullable().optional(),
  bankAccountName: textOrNull(120).optional(),
}).strict().refine((value) => Object.keys(value).length > 0)

const toSettings = (row) => ({
  name: row.name,
  bankCode: row.bank_code,
  bankAccountNumber: row.bank_account_number,
  bankAccountName: row.bank_account_name,
})

function validateShopId(shopId) {
  if (!z.string().uuid().safeParse(shopId).success) throw badRequest('Cửa hàng không hợp lệ.')
}

export async function getShopSettings(shopId, { client } = {}) {
  validateShopId(shopId)
  const row = await findShop(shopId, { client })
  if (!row) throw appError('SHOP_NOT_FOUND', 'Không tìm thấy cửa hàng.')
  return toSettings(row)
}

// Caller-supplied client must already be inside a transaction. This service does not
// grant approval; an agent must call it only after the user approves the change.
export async function updateShopSettings(shopId, patch, { client } = {}) {
  validateShopId(shopId)
  const parsed = patchSchema.safeParse(patch)
  if (!parsed.success) throw badRequest('Thông tin cửa hàng không hợp lệ.')
  const update = async (db) => {
    const row = await findShop(shopId, { client: db, lock: true })
    if (!row) throw appError('SHOP_NOT_FOUND', 'Không tìm thấy cửa hàng.')
    const before = toSettings(row)
    const after = toSettings(await saveShop(shopId, { ...before, ...parsed.data }, db))
    return { before, after }
  }
  return client ? update(client) : withTransaction(update)
}
