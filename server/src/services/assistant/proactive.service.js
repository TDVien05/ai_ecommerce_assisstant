import { createHash } from 'node:crypto'
import { env } from '../../config/env.js'
import { appError } from '../../errors/index.js'
import { logger } from '../../lib/logger.js'
import { withTransaction } from '../../repositories/database.js'
import * as messages from '../../repositories/assistant/assistantMessage.repository.js'
import * as facts from '../../repositories/assistant/proactiveFacts.js'
import * as state from '../../repositories/assistant/assistantProactiveState.repository.js'
import { publish } from './events.js'
import {
  PROACTIVE_LIMITS, periods, riskyOrderNotice, fraudNotice, overdueNotice, costNotice,
  unclassifiedNotice, revenueNotice, materiallyChanged,
} from './proactiveRules.js'

const CONVERSATION = 'proactive'
const BATCH_SIZE = 25

function noticeId(shopId, key) {
  const hash = createHash('sha256').update(`${shopId}:${key}`).digest('hex')
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}

async function detect(shopId, window, client) {
  const orders = await facts.riskyOrders(shopId, window.fraudSince, window.now, client)
  const fraud = await facts.unmatchedHighChecks(shopId, window.fraudSince, window.now, client)
  const overdue = await facts.overdueCount(shopId, window.now, client)
  const ledger = await facts.ledgerFacts(shopId, window, client)
  return [
    ...orders.map(riskyOrderNotice), fraudNotice(fraud, window), overdueNotice(overdue, window),
    costNotice(ledger, window), unclassifiedNotice(ledger.unclassified, window), revenueNotice(ledger, window),
  ].filter(Boolean)
}

function toMessage(shopId, candidate, now) {
  const { key, rule, priority, ...display } = candidate
  const id = noticeId(shopId, key)
  return {
    id: `proactive-${id}`, role: 'assistant', rule, priority, status: 'active', scannedAt: now.toISOString(),
    blocks: [{ type: 'proactiveNotice', noticeId: id, ...display }],
  }
}

const emptyView = () => ({ revision: 0, notices: [] })

/** Notices are optional: a failure here must not stop the chat snapshot from loading. */
export const loadProactive = async (shopId) => env.PROACTIVE_ENABLED
  ? messages.proactiveView(shopId).catch((error) => { scanError(error); return emptyView() })
  : emptyView()

async function updatedView(shopId, client) {
  await state.advanceRevision(shopId, client)
  return messages.proactiveView(shopId, client)
}

function publishView(shopId, proactive) {
  if (proactive) publish(shopId, { type: 'proactive', proactive })
}

async function storeScan(shopId, { opened, force, now }, client) {
  const existing = await state.lockScanState(shopId, opened, now, client)
  if (!existing) return null
  const lastScan = existing.last_scanned_at
  if (lastScan && (lastScan > now || (!force && now - lastScan < PROACTIVE_LIMITS.scanInterval))) return null

  const window = periods(now)
  const candidates = (await detect(shopId, window, client)).map((candidate) => toMessage(shopId, candidate, now))
  const saved = await messages.proactiveMessages(shopId, candidates.map(({ id }) => id), client)
  const byId = new Map(saved.map((message) => [message.id, message]))
  // Keep existing candidates at the same priority. New high-risk items can displace lower priorities.
  const selected = candidates.filter(({ id }) => !byId.has(id) || byId.get(id).status === 'active')
    .sort((a, b) => a.priority - b.priority || Number(byId.has(b.id)) - Number(byId.has(a.id)))
    .slice(0, PROACTIVE_LIMITS.open)
  const keep = new Set(selected.map(({ id }) => id))
  const created = []
  let changed = false

  for (const message of saved) {
    if (message.status !== 'active' || keep.has(message.id)) continue
    await messages.updateMessage(shopId, message.id, { ...message, status: 'resolved' }, client)
    changed = true
  }
  for (const message of selected) {
    const previous = byId.get(message.id)
    if (!previous) {
      await messages.insertMessage(shopId, CONVERSATION, message, client)
      created.push(message)
      changed = true
    } else if (materiallyChanged(previous.blocks[0], message.blocks[0])) {
      await messages.updateMessage(shopId, message.id, message, client)
      changed = true
    }
  }
  await state.recordScan(shopId, now, client)
  const proactive = changed ? await updatedView(shopId, client) : null
  const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(now)
  const canWrite = created.length && !env.AI_MOCK && (await import('../ai/index.js')).aiStatus() === 'live'
    && await state.reserveWording(shopId, day, env.PROACTIVE_AI_DAILY_LIMIT, client)
  return { proactive, wording: canWrite ? created : [] }
}

const numberWords = /(?:^|\s)(?:không|một|hai|ba|bốn|tư|năm|sáu|bảy|tám|chín|mười|trăm|nghìn|ngàn|triệu|tỷ)(?=\s|[.,!?]|$)/iu
function safeWording(value) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  const unsafe = /mật khẩu|tài khoản nhận tiền|chuyển tiền|đã thanh toán|thanh toán ngay|\bxóa\b|đăng ký|hạn nộp|thuế suất/iu
  return text.length <= 120 && /^Bạn có thể xem lại [\p{L}\p{M} ,.?]+$/u.test(text)
    && !numberWords.test(text) && !unsafe.test(text) ? text : null
}

async function addWording(shopId, created) {
  if (!created.length) return
  const input = {}
  for (const { rule, blocks: [block] } of created) {
    input[rule] ??= { count: 0, values: [] }
    input[rule].count++
    input[rule].values.push(...(block.result?.metrics.map(({ value }) => value) ?? []))
  }
  let wording
  try {
    const { chat } = await import('../ai/index.js')
    const { message } = await chat({
      role: 'agent', ctx: { shopId }, maxRetries: 0, maxTokens: 350,
      responseFormat: { type: 'json_object' }, signal: AbortSignal.timeout(8_000),
      messages: [
        { role: 'system', content: 'Viết một câu tiếng Việt ngắn gợi ý chủ cửa hàng xem lại dữ liệu cho mỗi nhóm thông báo. Mỗi câu bắt đầu bằng “Bạn có thể xem lại”. Trả đối tượng JSON với đúng các khóa được cung cấp. Không đưa con số, quyết định, tư vấn pháp lý, hướng dẫn thanh toán hay dữ liệu mới.' },
        { role: 'user', content: JSON.stringify(input) },
      ],
    })
    wording = JSON.parse(message.content)
    if (!wording || typeof wording !== 'object' || Array.isArray(wording)) return
  } catch (error) {
    logger.warn({ errorName: error.name }, 'Proactive wording unavailable')
    return
  }
  const proactive = await withTransaction(async (client) => {
    if (!await state.lockScanState(shopId, false, new Date(), client)) return null
    let changed = false
    const current = await messages.proactiveMessages(shopId, created.map(({ id }) => id), client)
    const active = new Map(current.filter(({ status }) => status === 'active').map((message) => [message.id, message]))
    for (const original of created) {
      const message = active.get(original.id)
      const text = safeWording(wording[original.rule])
      if (!message || message.scannedAt !== original.scannedAt || !text) continue
      const [block] = message.blocks
      await messages.updateMessage(shopId, message.id, { ...message, blocks: [{ ...block, wording: text }] }, client)
      changed = true
    }
    return changed ? updatedView(shopId, client) : null
  })
  publishView(shopId, proactive)
}

export async function scanProactive(shopId, { opened = false, force = false, now = new Date() } = {}) {
  if (!env.PROACTIVE_ENABLED) return
  const result = await withTransaction((client) => storeScan(shopId, { opened, force, now }, client))
  if (!result) return
  publishView(shopId, result.proactive)
  await addWording(shopId, result.wording)
}

function scanError(error) {
  logger.warn({ errorName: error.name, code: error.code }, 'Proactive scan failed')
}

export function requestProactiveScan(shopId, options) {
  if (env.PROACTIVE_ENABLED) setImmediate(() => void scanProactive(shopId, options).catch(scanError))
}

export async function dismissProactive(shopId, id) {
  const proactive = await withTransaction(async (client) => {
    const existing = await state.lockScanState(shopId, false, new Date(), client)
    const message = existing && await messages.getMessage(shopId, `proactive-${id}`, client)
    if (!message) throw appError('ALERT_NOT_FOUND', 'Không tìm thấy thông báo.')
    if (message.status === 'dismissed') return null
    await messages.updateMessage(shopId, message.id, { ...message, status: 'dismissed' }, client)
    return updatedView(shopId, client)
  })
  publishView(shopId, proactive)
}

export function startProactiveScheduler() {
  if (!env.PROACTIVE_ENABLED) return () => {}
  let running = false
  let stopped = false
  const timer = setInterval(async () => {
    if (running) return
    running = true
    try {
      const now = Date.now()
      const shops = await state.recentlyOpenedShops(
        new Date(now - PROACTIVE_LIMITS.recentActivity), new Date(now - PROACTIVE_LIMITS.scanInterval), BATCH_SIZE,
      )
      for (const shopId of shops) {
        if (stopped) break
        await scanProactive(shopId).catch(scanError)
      }
    } catch (error) { scanError(error) }
    finally { running = false }
  }, PROACTIVE_LIMITS.scanInterval)
  timer.unref()
  return () => { stopped = true; clearInterval(timer) }
}
