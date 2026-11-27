import { env } from '../../config/env.js'

/** AI roles. Each one can use its own model via AI_MODEL_<ROLE>. */
export const ROLES = Object.freeze(['agent', 'bot', 'classify', 'vision', 'fraud'])

/** Max tool-call rounds per role (bot 5, agent 15; others rarely use tools). */
export const MAX_ROUNDS = Object.freeze({ agent: 15, bot: 5, classify: 3, vision: 3, fraud: 3 })

const roleModel = {
  agent: () => env.AI_MODEL_AGENT,
  bot: () => env.AI_MODEL_BOT,
  classify: () => env.AI_MODEL_CLASSIFY,
  vision: () => env.AI_MODEL_VISION,
  fraud: () => env.AI_MODEL_FRAUD,
}

/** Model for a role: AI_MODEL_<ROLE>, falling back to AI_MODEL. Undefined when neither is set. */
export function modelFor(role) {
  if (!roleModel[role]) throw new Error(`Unknown AI role: ${role}`)
  return roleModel[role]() ?? env.AI_MODEL
}

/** True when a real provider call is possible (base URL + key + a default model). */
export function isConfigured() {
  return Boolean(env.AI_BASE_URL && env.AI_API_KEY && env.AI_MODEL)
}

/**
 * Current AI mode, exposed on /health as features.ai:
 *   'mock'  — AI_MOCK=true, scripted answers
 *   'live'  — real provider configured
 *   'rules' — no provider configured, features fall back to rule mode
 */
export function aiMode() {
  if (env.AI_MOCK) return 'mock'
  return isConfigured() ? 'live' : 'rules'
}
