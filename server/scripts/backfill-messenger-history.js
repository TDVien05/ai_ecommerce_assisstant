// One-off Messenger history backfill. Run once when a Page is first connected:
//
//   cd server
//   npm run backfill:messenger -- --shop <shop-uuid> [--dry-run]
//   npm run backfill:messenger -- --page <fb-page-id> [--dry-run]
//
// Live messages do NOT need this: they arrive on /webhooks/messenger. See
// docs/MESSENGER.md. Meta only lets you read the 20 most recent messages of a conversation.
import 'dotenv/config'
import { pool } from '../db/pool.js'
import { backfillShop } from '../services/messenger/history.service.js'

function readArgs(argv) {
  const args = { dryRun: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry-run') args.dryRun = true
    else if (arg === '--shop') args.shopId = argv[++i]
    else if (arg === '--page') args.pageId = argv[++i]
    else if (arg === '--max-conversations') args.maxConversations = Number(argv[++i])
    else if (arg === '--max-per-conversation') args.maxPerConversation = Number(argv[++i])
  }
  return args
}

async function main() {
  const args = readArgs(process.argv.slice(2))

  if (!args.shopId && !args.pageId) {
    console.error('Cần --shop <shop-uuid> hoặc --page <fb-page-id>.')
    process.exitCode = 1
    return
  }

  let shopId = args.shopId
  if (!shopId) {
    // A Page maps to exactly one live shop (demo copies reuse the template's Page id).
    const { rows } = await pool.query(
      'SELECT id FROM shops WHERE fb_page_id = $1 AND NOT is_demo ORDER BY created_at LIMIT 1',
      [args.pageId],
    )
    if (!rows[0]) {
      console.error(`Không tìm thấy shop nào gắn Page ${args.pageId}.`)
      process.exitCode = 1
      return
    }
    shopId = rows[0].id
  }

  console.log(`Backfill shop ${shopId}${args.dryRun ? ' (dry run)' : ''}…`)
  const stats = await backfillShop(shopId, {
    pageId: args.pageId,
    dryRun: args.dryRun,
    maxConversations: args.maxConversations,
    maxPerConversation: args.maxPerConversation,
  })

  console.log(
    `Xong: ${stats.conversations} hội thoại, lưu ${stats.saved}, bỏ qua ${stats.skipped}, ` +
      `quá hạn 20 tin ${stats.expired}, lỗi ${stats.failed}.`,
  )
}

main()
  .catch((error) => {
    console.error('Backfill thất bại:', error.message)
    process.exitCode = 1
  })
  .finally(() => pool.end())
