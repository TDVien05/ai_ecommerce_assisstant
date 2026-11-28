import express from 'express'
import path from 'node:path'
import { pinoHttp } from 'pino-http'
import { env } from './config/env.js'
import { logger } from './lib/logger.js'
import { cors } from './middlewares/cors.js'
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js'
import { healthRouter } from './routes/health.js'
import { apiRouter } from './routes/index.js'
import { messengerWebhookRouter } from './routes/webhook.messenger.js'
import { sepayWebhookRouter } from './routes/webhook.sepay.js'
import { simWebhookRouter } from './routes/webhook.sim.js'

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1) // behind ngrok/cloudflared or a reverse proxy

  app.use(
    pinoHttp({
      logger,
      // Strip query strings from logged URLs (hub.verify_token etc.).
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url.split('?')[0] }),
        res: (res) => ({ statusCode: res.statusCode }),
        // Full stacks of real errors are logged once by errorHandler; keep access logs short.
        err: (err) => ({ message: err.message }),
      },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    }),
  )

  // Webhooks are mounted BEFORE express.json() so each one controls its own body parsing
  // (Messenger needs the raw body for signature verification).
  app.use('/webhooks/messenger', messengerWebhookRouter)
  app.use('/webhooks/sepay', sepayWebhookRouter)
  app.use('/webhooks/sim', simWebhookRouter)

  app.use(express.json({ limit: '1mb' }))

  // The client calls /api and /health; in production it lives on a different origin.
  app.use(['/api', '/health'], cors)

  app.use('/health', healthRouter)
  app.use('/api', apiRouter)

  if (env.SERVE_CLIENT_DIR) {
    const directory = path.resolve(env.SERVE_CLIENT_DIR)
    const reserved = /^\/(?:api|webhooks|health)(?:\/|$)/
    const staticFiles = express.static(directory, { index: false })
    app.use((req, res, next) => reserved.test(req.path) ? next() : staticFiles(req, res, next))
    app.get(/.*/, (req, res, next) => {
      if (reserved.test(req.path)) return next()
      res.sendFile(path.join(directory, 'index.html'))
    })
  }

  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
