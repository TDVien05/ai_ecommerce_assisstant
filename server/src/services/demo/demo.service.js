import { env } from '../../config/env.js'
import { appError, forbidden, notFound } from '../../errors/index.js'
import { logger } from '../../lib/logger.js'
import { withTransaction } from '../../repositories/database.js'
import * as shopRepo from '../../repositories/shop/shop.repository.js'
import * as userRepo from '../../repositories/auth/user.repository.js'
import * as productRepo from '../../repositories/products/product.repository.js'
import * as customerRepo from '../../repositories/messenger/customer.repository.js'
import * as conversationRepo from '../../repositories/messenger/conversation.repository.js'
import * as messageRepo from '../../repositories/messenger/message.repository.js'
import * as orderRepo from '../../repositories/orders/order.repository.js'
import * as orderItemRepo from '../../repositories/orders/orderItem.repository.js'
import * as ledgerRepo from '../../repositories/finance/ledgerEntry.repository.js'
import * as labelRepo from '../../repositories/finance/label.repository.js'
import * as paymentRepo from '../../repositories/payments/paymentTransaction.repository.js'
import * as fraudCheckRepo from '../../repositories/payments/fraudCheck.repository.js'
import * as blocklistRepo from '../../repositories/payments/blocklist.repository.js'
import * as todoRepo from '../../repositories/shop/todo.repository.js'

/**
 * Demo shops: every judge session gets its own copy of the seeded template shop, so two
 * people clicking at the same time never edit the same rows. Copies are deleted after
 * DEMO_SHOP_TTL_HOURS by an hourly job (see startServer in app.js).
 */

export async function findTemplate() {
  return shopRepo.findTemplate()
}

const unavailable = () => appError('DEMO_UNAVAILABLE', 'Shop mẫu chưa có. Chạy `npm run seed` trước.')

export async function createDemoShop({ ownerName = 'Khách tham quan', passwordHash = 'x' } = {}) {
  const template = await findTemplate()
  if (!template) throw unavailable()

  return withTransaction(async (client) => {
    const shop = await shopRepo.createDemo({
      name: `${template.name} · bản thử`,
      bankCode: template.bank_code,
      bankAccountNumber: template.bank_account_number,
      bankAccountName: template.bank_account_name,
      ttlHours: env.DEMO_SHOP_TTL_HOURS,
    }, client)
    const shopId = shop.id
    const user = await userRepo.create({ shopId, email: `demo-${shopId.slice(0, 8)}@flowy.local`, passwordHash, ownerName }, client)

    await copyTemplate(client, shopId, template.id)
    return { shopId, userId: user.id, name: shop.name, expiresAt: shop.demo_expires_at }
  })
}

/** Put a demo shop back to the template data, keeping the same shop id and user. */
export async function resetDemoShop(shopId) {
  const shop = await shopRepo.findDemoFlag(shopId)
  if (!shop) throw notFound('Không tìm thấy shop.')
  if (!shop.is_demo) throw forbidden('Chỉ shop thử mới được đặt lại dữ liệu.')

  const template = await findTemplate()
  if (!template) throw unavailable()

  return withTransaction(async (client) => {
    // Same tables and order as before; orders, order items and messages follow customers by cascade.
    for (const repo of [customerRepo, productRepo, ledgerRepo, paymentRepo, todoRepo, blocklistRepo, labelRepo, fraudCheckRepo, conversationRepo]) {
      await repo.removeAllForShop(shopId, client)
    }
    await copyTemplate(client, shopId, template.id)
    await shopRepo.extendDemo(shopId, env.DEMO_SHOP_TTL_HOURS, client)
    return { shopId, reset: true }
  })
}

/** Hourly job: drop demo shops whose TTL passed (everything cascades from shops). */
export async function deleteExpiredDemoShops(now = new Date()) {
  const rows = await shopRepo.findExpiredDemoShops(now)
  for (const shop of rows) {
    await shopRepo.deleteById(shop.id)
    logger.info({ shopId: shop.id, name: shop.name }, 'expired demo shop deleted')
  }
  return rows.length
}

/**
 * Copy every table of the template into a demo shop, in one transaction. Every date is shifted
 * so that the newest template order lands "now"; the demo therefore always looks like the last
 * 30 days of trading. The order matters: children are matched to the rows copied before them.
 */
async function copyTemplate(client, shopId, templateId) {
  await paymentRepo.ensureDemoSequence(client)
  const interval = await orderRepo.demoShift(templateId, client)
  const suffix = shopId.slice(0, 4)

  await productRepo.copyFromShop(shopId, templateId, client)
  await customerRepo.copyFromShop(shopId, templateId, client)
  await conversationRepo.copyFromShop(shopId, templateId, client)
  await messageRepo.copyFromShop(shopId, templateId, interval, shopId.slice(0, 8), client)

  await orderRepo.createDemoOrderMap(templateId, client)
  await orderRepo.copyFromShop(shopId, templateId, interval, suffix, client)
  await orderItemRepo.copyFromShop(shopId, client)
  await ledgerRepo.copyFromShop(shopId, templateId, interval, suffix, client)
  await paymentRepo.copyFromShop(shopId, templateId, interval, suffix, client)
  await fraudCheckRepo.copyFromShop(shopId, templateId, interval, client)
  await labelRepo.copyFromShop(shopId, templateId, client)
  await blocklistRepo.copyFromShop(shopId, templateId, client)
  await todoRepo.copyFromShop(shopId, templateId, interval, client)
}
