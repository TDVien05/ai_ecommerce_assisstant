import * as paymentService from '../../services/shop/payment.service.js'

/**
 * Payment settings of the caller's own shop. requireAuth already scoped req.auth.
 * The plaintext secret is never returned: only whether it exists and its last 4 characters.
 */
export const getPaymentConfig = async (req, res) => {
  res.json({ payment: await paymentService.getPaymentConfig(req.auth.shopId) })
}

export const setPaymentSecret = async (req, res) => {
  res.json({ payment: await paymentService.setPaymentSecret(req.auth.shopId, req.body) })
}

export const clearPaymentSecret = async (req, res) => {
  res.json({ payment: await paymentService.clearPaymentSecret(req.auth.shopId) })
}
