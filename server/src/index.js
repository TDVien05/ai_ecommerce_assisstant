import { env } from './config/env.js'
import { createApp } from './app.js'
import { pool } from './db/pool.js'
import { logger } from './lib/logger.js'
import { deleteExpiredDemoShops } from './services/demo.service.js'

const app = createApp()

const server = app.listen(env.PORT, () => {
  logger.info(`Server listening on http://localhost:${env.PORT}`)
})

// Demo shops live DEMO_SHOP_TTL_HOURS; sweep once at boot and then hourly.
const sweepDemoShops = () =>
  deleteExpiredDemoShops().catch((err) => logger.error({ err }, 'demo shop cleanup failed'))
sweepDemoShops()
setInterval(sweepDemoShops, 60 * 60 * 1000).unref()

const shutdown = (signal) => {
  logger.info(`${signal} received, shutting down`)
  server.close(() => pool.end().finally(() => process.exit(0)))
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
