import 'dotenv/config'
import { z } from 'zod'

// Empty strings in .env are treated as "not set".
const optional = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional())

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  SERVE_CLIENT_DIR: optional,
  PUBLIC_BASE_URL: optional,

  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(8),
  DEMO_EMAIL: optional,
  DEMO_PASSWORD: optional,
  // How long a demo shop copy lives before the hourly cleanup removes it.
  DEMO_SHOP_TTL_HOURS: z.coerce.number().int().positive().default(24),
  // Encrypts Page tokens at rest (optional until the deploy milestone).
  APP_ENCRYPTION_KEY: optional,

  // Meta Messenger (required from M1)
  FB_APP_SECRET: optional,
  FB_VERIFY_TOKEN: optional,
  FB_PAGE_ACCESS_TOKEN: optional,
  GRAPH_API_VERSION: z.string().default('v23.0'),

  // SePay (required from M4)
  SEPAY_WEBHOOK_API_KEY: optional,
  // HMAC key for the in-app simulator webhook (/webhooks/sim).
  SIM_WEBHOOK_SECRET: optional,

  // AI, OpenAI-compatible chat completions (required from M2)
  AI_BASE_URL: optional,
  AI_API_KEY: optional,
  AI_MODEL: optional,
  // Per-role models; each falls back to AI_MODEL when empty (see services/ai/config.js).
  AI_MODEL_AGENT: optional,
  AI_MODEL_CLASSIFY: optional,
  AI_MODEL_BOT: optional,
  AI_MODEL_VISION: optional,
  AI_MODEL_FRAUD: optional,
  // true → scripted mock, never calls the provider.
  AI_MOCK: z.preprocess((v) => (v === '' || v === undefined ? 'false' : v), z.enum(['true', 'false'])).transform((v) => v === 'true'),
  AI_DAILY_RUN_LIMIT: z.coerce.number().int().positive().default(50),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),

  // Receiving bank account (VietQR)
  BANK_CODE: z.string().default('MB'),
  BANK_ACCOUNT_NUMBER: optional,
  BANK_ACCOUNT_NAME: optional,
}).superRefine(({ NODE_ENV, JWT_SECRET }, ctx) => {
  // Production must not run with a short or sample signing key (the repo is public).
  if (NODE_ENV !== 'production') return
  if (JWT_SECRET.trim().length < 32 || /change-?me/i.test(JWT_SECRET)) {
    ctx.addIssue({
      code: 'custom',
      path: ['JWT_SECRET'],
      message: 'In production, use a random value of at least 32 characters, not a sample value',
    })
  }
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  // Print only variable names and issues, never values.
  console.error('Invalid environment variables:')
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`)
  }
  process.exit(1)
}

export const env = Object.freeze(parsed.data)
