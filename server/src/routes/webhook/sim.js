import express, { Router } from 'express'
import * as simController from '../../controllers/webhook/sim.controller.js'
import { verifySimSignature } from '../../middlewares/verifySimSignature.js'

export const simWebhookRouter = Router()

// Same shape as the two real webhooks: HMAC is checked on the raw body before parsing.
simWebhookRouter.post('/', express.raw({ type: '*/*', limit: '1mb' }), verifySimSignature, simController.receive)
