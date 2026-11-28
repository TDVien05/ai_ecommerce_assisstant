// The backend's single entry point: `node src/app.js` registers everything and starts the server.
// Importing this module (tests) only gives createApp(); nothing listens until startServer() runs.
// See docs/ARCHITECTURE.md, section "Starting the server (app.js)".
import express, { Router } from 'express'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { pinoHttp } from 'pino-http'
import { env } from './config/env.js'
import { logger } from './lib/logger.js'
import { closeDatabase } from './config/database.js'
import { cors } from './middlewares/cors.js'
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js'
import { requireAuth } from './middlewares/requireAuth.js'
import { healthRouter } from './routes/health/health.js'
import { messengerWebhookRouter } from './routes/webhook/messenger.js'
import { sepayWebhookRouter } from './routes/webhook/sepay.js'
import { simWebhookRouter } from './routes/webhook/sim.js'
import { authRouter } from './routes/auth/auth.js'
import { devRouter } from './routes/dev/dev.js'
import { demoRouter } from './routes/demo/demo.js'
import { assistantRouter } from './routes/assistant/assistant.js'
import { financeRouter } from './routes/finance/finance.js'
import { ordersRouter } from './routes/orders/orders.js'
import { alertsRouter } from './routes/alerts/alerts.js'
import { deleteExpiredDemoShops } from './services/demo/demo.service.js'
import { recover, interruptActive } from './services/assistant/assistant.service.js'
import { closeAllStreams } from './services/assistant/events.js'

/** Dashboard REST API, mounted at /api (docs/API.md section 3). Add a new feature router here. */
function createApiRouter() {
  const api = Router()
  api.use('/auth', authRouter)
  api.use(requireAuth)
  // Everything below requires the shop owner's JWT; req.auth = { userId, shopId }.
  api.use('/dev', devRouter)
  api.use('/demo', demoRouter)
  api.use('/assistant', assistantRouter)
  api.use('/finance', financeRouter)
  api.use('/orders', ordersRouter)
  api.use('/alerts', alertsRouter)
  return api
}

/** Build the Express app with every middleware and router. No side effects; tests call this. */
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
  app.use('/api', createApiRouter())

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

/** Recover interrupted work, listen on PORT, start background jobs and handle shutdown. */
export async function startServer() {
  try { await recover() } catch (err) { logger.error({ err }, 'Assistant recovery failed') }
  const server = createApp().listen(env.PORT, () => {
    logger.info(`Server listening on http://localhost:${env.PORT}`)
  })

  // Demo shops live DEMO_SHOP_TTL_HOURS; sweep once at boot and then hourly.
  const sweepDemoShops = () =>
    deleteExpiredDemoShops().catch((err) => logger.error({ err }, 'demo shop cleanup failed'))
  sweepDemoShops()
  setInterval(sweepDemoShops, 60 * 60 * 1000).unref()

  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down`)
    closeAllStreams()
    const closing = new Promise((resolve) => server.close(resolve))
    Promise.all([closing, interruptActive().catch((err) => logger.error({ err }, 'Assistant shutdown recovery failed'))])
      .then(() => closeDatabase()).finally(() => process.exit(0))
    setTimeout(() => process.exit(1), 10_000).unref()
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  return server
}

// `node src/app.js` starts the server; importing this file does not.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await startServer()
}
