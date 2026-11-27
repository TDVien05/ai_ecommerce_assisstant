// AI socket: the only entry point the rest of the server uses for AI.
// AI_MOCK=true → mock.js, otherwise client.js (real provider). Callers never import
// client.js or call the provider directly.
//
// NOTE: provisional until Duy's B5 socket and docs/ai-interface.md land. When they do, keep
// their signatures and route them to the functions below.
import { env } from '../../config/env.js'
import * as realClient from './client.js'
import * as mockClient from './mock.js'
import { aiMode } from './config.js'
import { runToolLoop as runLoop } from './toolLoop.js'

export { AI_UNAVAILABLE, AiUnavailableError, isAiUnavailable } from './errors.js'
export { ROLES, MAX_ROUNDS, modelFor } from './config.js'
export { loadPrompt, wrapUntrusted, PROMPTS } from './prompts/index.js'

const impl = () => (env.AI_MOCK ? mockClient : realClient)

/** One chat completion. See client.js for options. Throws AiUnavailableError on failure. */
export const chat = (opts) => impl().chat(opts)

/**
 * Model + tools loop. Bot max 5 rounds, agent max 15 (override with maxRounds).
 * runToolLoop({ role, messages, tools, maxRounds, ctx, signal })
 * Tools: { name, description, schema (zod), run(input, ctx) }; ctx comes from the server
 * (shopId from req.auth), never from the model.
 */
export const runToolLoop = (opts) => runLoop({ ...opts, chat })

/** 'live' | 'mock' | 'rules' — shown on /health as features.ai. */
export const aiStatus = () => aiMode()
