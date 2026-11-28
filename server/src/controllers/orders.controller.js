import * as orders from '../services/order.service.js'
export async function list(req,res) { res.json({items:await orders.listOrders(req.auth.shopId,req.validatedQuery)}) }
export async function get(req,res) { res.json({order:await orders.getOrderDetail(req.auth.shopId,req.params.id)}) }
export async function update(req,res) { res.json({order:await orders.updateOrderStatus(req.auth.shopId,req.params.id,req.body.status)}) }
