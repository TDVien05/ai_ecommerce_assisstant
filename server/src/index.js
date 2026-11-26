import { env } from './config/env.js'
import { createApp } from './app.js'
import { pool } from './db/pool.js'
import { logger } from './lib/logger.js'

const app = createApp()

const server = app.listen(env.PORT, () => {
  logger.info(`Server listening on http://localhost:${env.PORT}`)
})

const shutdown = (signal) => {
  logger.info(`${signal} received, shutting down`)
  server.close(() => pool.end().finally(() => process.exit(0)))
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
