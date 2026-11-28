import * as simService from '../../services/webhook/sim.service.js'

// POST /api/dev/simulate-payment — the dashboard's "Giả lập thanh toán" button.
// requireAuth already put the shop on req.auth; the order must belong to that shop.
export const simulatePayment = async (req, res) => {
  const result = await simService.simulatePayment(req.auth.shopId, req.body.orderId)
  res.status(202).json(result)
}
