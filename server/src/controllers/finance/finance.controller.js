import * as finance from '../../services/finance/finance.service.js'

export async function ledger(req, res) { res.json(await finance.getLedger(req.auth.shopId, req.validatedQuery)) }
export async function create(req, res) { res.status(201).json(await finance.createEntry(req.auth.shopId, req.body)) }
export async function remove(req, res) { res.json(await finance.deleteEntry(req.auth.shopId, req.params.id)) }
export async function summary(req, res) { res.json(await finance.getSummary(req.auth.shopId, req.validatedQuery)) }
export async function timeseries(req, res) { res.json(await finance.getTimeseries(req.auth.shopId, req.validatedQuery)) }
export async function topProducts(req, res) { res.json(await finance.getTopProducts(req.auth.shopId, req.validatedQuery)) }
