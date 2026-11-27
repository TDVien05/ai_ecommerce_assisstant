import express, { Router } from 'express'
import * as sepayController from '../controllers/webhook.sepay.controller.js'
import { verifySepayKey } from '../middlewares/verifySepayKey.js'

export const sepayWebhookRouter = Router()

// API key is checked before the body is parsed.
sepayWebhookRouter.post('/', verifySepayKey, express.json({ limit: '100kb' }), sepayController.receive)
