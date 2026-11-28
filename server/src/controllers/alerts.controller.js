import * as alerts from '../services/alerts.service.js'
export async function list(req,res) { res.json({items:await alerts.listAlerts(req.auth.shopId,req.validatedQuery)}) }
export async function hold(req,res) { res.json(await alerts.holdAlert(req.auth.shopId,req.params.id)) }
export async function dismiss(req,res) { res.json(await alerts.dismissAlert(req.auth.shopId,req.params.id)) }
export async function safeAction(req,res) { await alerts.holdAlert(req.auth.shopId,req.params.id);res.sendStatus(204) }
export async function dismissNotice(req,res) { await alerts.dismissNotice(req.auth.shopId,req.params.id);res.sendStatus(204) }
