import express, { Router } from 'express'
import * as messengerController from '../../controllers/webhook/messenger.controller.js'
import { verifyFbSignature } from '../../middlewares/verifyFbSignature.js'

export const messengerWebhookRouter = Router()

messengerWebhookRouter.get('/', messengerController.verify)

// Raw body is kept so the signature is verified BEFORE parsing.
messengerWebhookRouter.post(
  '/',
  express.raw({ type: '*/*', limit: '1mb' }),
  verifyFbSignature,
  messengerController.receive,
)
