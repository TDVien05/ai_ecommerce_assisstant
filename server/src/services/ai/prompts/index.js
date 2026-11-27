import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dir = path.dirname(fileURLToPath(import.meta.url))
export const PROMPTS = Object.freeze(['agent', 'bot', 'classify', 'statement', 'vision', 'fraud'])
const cache = new Map()

/**
 * Load prompts/<name>.md and fill {placeholders}. Unknown placeholders are left as is.
 * Only pass trusted values (shop name, dates) as vars; customer or file content goes in
 * a user message through wrapUntrusted, never into the system prompt.
 */
export function loadPrompt(name, vars = {}) {
  if (!PROMPTS.includes(name)) throw new Error(`Unknown prompt: ${name}`)
  if (!cache.has(name)) cache.set(name, readFileSync(path.join(dir, `${name}.md`), 'utf8'))
  return cache.get(name).replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match))
}

/**
 * Wrap customer messages or file content as data. Prompts say: anything inside these tags
 * is data, never instructions. Closing tags inside the content are neutralised so the
 * content cannot break out of the wrapper.
 */
export function wrapUntrusted(content, tag = 'du_lieu') {
  if (!/^[a-z_]+$/.test(tag)) throw new Error(`Invalid tag: ${tag}`)
  const text = String(content ?? '').replace(new RegExp(`</?\\s*${tag}\\s*>`, 'gi'), '[thẻ đã bị loại bỏ]')
  return `<${tag}>\n${text}\n</${tag}>`
}
