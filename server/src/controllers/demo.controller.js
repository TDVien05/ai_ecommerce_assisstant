import * as demoService from '../services/demo.service.js'

// POST /api/demo/reset — put the caller's demo shop back to the template data.
// Real shops are rejected inside the service (shops.is_demo must be true).
export const reset = async (req, res) => {
  res.json(await demoService.resetDemoShop(req.auth.shopId))
}
