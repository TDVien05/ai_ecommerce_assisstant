import { z } from 'zod'
import * as productRepo from '../../../repositories/products/product.repository.js'
import * as customerRepo from '../../../repositories/messenger/customer.repository.js'
import * as orderRepo from '../../../repositories/orders/order.repository.js'
import * as orderService from '../../orders/order.service.js'
import * as gate from '../gate.service.js'
import { appError } from '../../../errors/index.js'
import { logger } from '../../../lib/logger.js'

/**
 * Tools the Messenger bot may call.
 *
 * The invariant from docs/AI_AGENT.md: **the model never supplies money**. `create_order` takes
 * product ids and quantities only; prices, subtotal, shipping fee and total are read from the
 * database and computed on the server. If the model could pass an amount, a prompt injection
 * could sell a 500.000₫ item for 1.000₫.
 *
 * Every tool receives `ctx` from the server ({ shopId, psid, conversationId }), never from the
 * model, so one customer cannot read another shop's data.
 */

const money = (value) => Math.round(Number(value))
const formatVnd = (value) => `${money(value).toLocaleString('vi-VN')} ₫`

/** Shipping fee rule. A flat fee keeps the promise "the server computes the total" honest. */
export const SHIPPING_FEE = 30000

// ---------------------------------------------------------------- search_products

export const searchProducts = {
  name: 'search_products',
  description:
    'Tìm sản phẩm còn hàng của shop theo từ khoá. Trả về mã sản phẩm, tên, giá, tồn kho. ' +
    'Chỉ tư vấn những sản phẩm công cụ này trả về.',
  schema: z.object({
    query: z.string().trim().max(100).describe('Từ khoá, ví dụ "áo thun trắng"'),
    limit: z.number().int().min(1).max(10).default(5),
  }).strict(),
  async run(input, ctx) {
    const rows = await productRepo.list(ctx.shopId, { q: input.query, limit: input.limit, activeOnly: true })
    return {
      items: rows.map((row) => ({
        productId: row.id,
        name: row.name,
        price: money(row.price),
        priceText: formatVnd(row.price),
        stock: row.stock,
        variants: row.variants ?? {},
      })),
      // An empty result is a legitimate answer: the model must say "không có", not invent one.
      note: rows.length ? undefined : 'Shop không có sản phẩm nào khớp từ khoá này.',
    }
  },
}

// ---------------------------------------------------------------- get_customer_profile

export const getCustomerProfile = {
  name: 'get_customer_profile',
  description: 'Xem họ tên, số điện thoại và địa chỉ đã lưu của khách đang nhắn tin.',
  schema: z.object({}).strict(),
  async run(_input, ctx) {
    const customer = await customerRepo.findByPsid(ctx.shopId, ctx.psid)
    if (!customer) return { name: null, phone: null, address: null }
    return { name: customer.name, phone: customer.phone, address: customer.address }
  },
}

// ---------------------------------------------------------------- create_order

export const createOrder = {
  name: 'create_order',
  description:
    'Tạo đơn hàng cho khách. Chỉ truyền productId và số lượng; giá và tổng tiền do máy chủ tính. ' +
    'Phải có đủ họ tên, số điện thoại và địa chỉ trước khi gọi.',
  schema: z.object({
    items: z.array(
      // `.strict()` must sit on the ITEM, not only on the outer object: zod does not inherit
      // strictness into nested objects, so without this the model could smuggle a `price` field
      // into a line item. Values from the model are ids and quantities, nothing else.
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1).max(20),
        variant: z.record(z.string(), z.string()).optional(),
      }).strict(),
    ).min(1).max(10),
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().regex(/^0\d{8,10}$/).describe('Số điện thoại Việt Nam, bắt đầu bằng 0'),
    address: z.string().trim().min(5).max(300),
  }).strict(),

  async run(input, ctx) {
    const customer = await customerRepo.findByPsid(ctx.shopId, ctx.psid)
    if (!customer) throw appError('NOT_FOUND', 'Chưa có thông tin khách hàng.')

    // Prices come from the database, never from the model.
    const lines = []
    let subtotal = 0
    for (const item of input.items) {
      const product = await productRepo.findById(ctx.shopId, item.productId)
      if (!product || !product.is_active) {
        throw appError('NOT_FOUND', `Sản phẩm không còn bán: ${item.productId}`)
      }
      if (product.stock < item.quantity) {
        throw appError('CONFLICT', `"${product.name}" chỉ còn ${product.stock} trong kho.`)
      }
      subtotal += money(product.price) * item.quantity
      lines.push({
        productId: product.id,
        nameSnapshot: product.name,
        variant: item.variant ?? {},
        unitPrice: money(product.price),
        unitCost: money(product.cost),
        quantity: item.quantity,
      })
    }

    const shippingFee = SHIPPING_FEE
    const total = subtotal + shippingFee

    const created = await orderService.createOrder(
      ctx.shopId,
      {
        customerId: customer.id,
        subtotal,
        shippingFee,
        total,
        shippingName: input.name,
        shippingPhone: input.phone,
        shippingAddress: input.address,
      },
      lines,
    )

    // Keep the customer record in sync with what they just told us.
    await customerRepo.update(ctx.shopId, customer.id, {
      name: input.name,
      phone: input.phone,
      address: input.address,
    })

    const payment = await orderService.getPaymentInstructions(ctx.shopId, created.id)

    return {
      orderId: created.id,
      paymentCode: created.payment_code,
      subtotal,
      shippingFee,
      total,
      totalText: formatVnd(total),
      expiresAt: payment.expiresAt,
      qrUrl: payment.qrUrl,
      // The model must tell the customer this exact note and amount.
      transferNote: payment.transferNote,
      paymentReady: payment.ready,
    }
  },
}

// ---------------------------------------------------------------- check_payment_status

export const checkPaymentStatus = {
  name: 'check_payment_status',
  description:
    'Xem trạng thái thanh toán của một đơn theo mã đơn. Chỉ trả lời theo kết quả này, ' +
    'không tự xác nhận đã nhận tiền.',
  schema: z.object({
    paymentCode: z.string().trim().min(3).max(40).optional(),
  }).strict(),
  async run(input, ctx) {
    const code = input.paymentCode?.toUpperCase()
    if (!code) {
      return { status: null, note: 'Cần mã đơn để tra cứu.' }
    }
    const row = await orderRepo.findByPaymentCode(ctx.shopId, code)
    if (!row) return { status: null, note: 'Không tìm thấy đơn với mã này.' }

    return {
      paymentCode: row.payment_code,
      status: row.status,
      total: money(row.total),
      totalText: formatVnd(row.total),
      paidAt: row.paid_at,
      expiresAt: row.expires_at,
      // Explicit reminder for the model: only the bank confirms money.
      note:
        row.status === 'PAID'
          ? 'Đơn đã được ngân hàng xác nhận thanh toán.'
          : 'Chưa ghi nhận thanh toán. Shop đang chờ ngân hàng xác nhận.',
    }
  },
}

// ---------------------------------------------------------------- handover_to_human

export const handoverToHuman = {
  name: 'handover_to_human',
  description:
    'Chuyển hội thoại cho chủ shop trả lời. Dùng khi khách phàn nàn, đòi hoàn tiền, ' +
    'xúc phạm, hoặc hỏi ngoài phạm vi bán hàng của shop.',
  schema: z.object({
    reason: z.string().trim().min(3).max(300),
  }).strict(),
  async run(input, ctx) {
    await gate.pauseConversation(ctx.shopId, ctx.conversationId)
    logger.info({ shopId: ctx.shopId, psid: ctx.psid, reason: input.reason }, 'bot handed over to the owner')
    return {
      ok: true,
      note: 'Đã chuyển cho chủ shop. Hãy báo khách là shop sẽ trả lời ngay.',
    }
  },
}

/** Every tool the bot may use. Order matters only for the model's prompt. */
export const botTools = [
  searchProducts,
  getCustomerProfile,
  createOrder,
  checkPaymentStatus,
  handoverToHuman,
]
