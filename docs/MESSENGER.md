# Messenger: lấy tin nhắn khách hàng

Có hai đường, dùng đúng việc:

| | Webhook (chính) | Conversations API (một lần) |
|---|---|---|
| Khi nào | Mọi tin nhắn mới, realtime | Backfill lịch sử khi Page mới gắn |
| Cần Page token | Không | Có (`FB_PAGE_ACCESS_TOKEN` hoặc `shops.fb_page_token`) |
| Cần App Review | Không | Có, nếu khách không có role trên app/Page |
| Giới hạn | Không | Chỉ đọc được **20 tin gần nhất** mỗi hội thoại |
| Code | `services/messenger/messenger.service.js` | `services/messenger/history.service.js` |

Meta **đẩy** tin nhắn tới `/webhooks/messenger`, nên không cần polling và không cần quyền gì thêm.
Đây là đường chạy chính.

## Đường chính: webhook → DB

```
Meta → POST /webhooks/messenger (X-Hub-Signature-256)
     → verifyFbSignature (raw body, FB_APP_SECRET)
     → messenger.controller: tách từng event → ingest()
     → webhook.service: lưu webhook_events (chống trùng) → fraud → dispatch
     → messenger.service.handleMessengerEvent
     → customers.upsertByPsid → conversations.ensureForCustomer → messages.createAt
```

Đăng ký handler ở `app.js` trong `startServer()`, **không** đăng ký lúc import module — nếu không
test gọi `createApp()` sẽ bị nhân đôi handler.

### Bảng ghi

| Sự kiện | `messages.role` | `messages.content` | `messages.mid` |
|---|---|---|---|
| `messenger.message` | `user` | `message.text` | `message.mid` |
| `messenger.message` (chỉ có tệp) | `user` | `[image] <url>` | `message.mid` |
| `messenger.postback` | `user` | `postback.title` | `<psid>:<timestamp>` |

`mid` là khoá chống trùng (`messages.mid UNIQUE`). Meta retry hay ta replay đều chỉ ra một dòng.

### Shop không xác định

Controller chạy trước khi biết shop. `resolveShopId` tra `shops.fb_page_id`. Không khớp Page nào
→ `shopId = null` → sự kiện vẫn `PROCESSED` nhưng **không ghi dòng nào**, để không rơi vào shop
khác. Đây là hành vi cố ý, có test cho nó.

## Bot gates

Two checks run **before any AI work**, so a paused conversation or an exhausted budget costs
nothing (`services/messenger/gate.service.js`):

| Gate | Column / env | Effect |
|---|---|---|
| `ai_paused` | `conversations.ai_paused` | The message is still stored (the owner wants to read it); the bot stays quiet |
| Daily quota | `AI_DAILY_RUN_LIMIT`, per shop | Stops one customer from burning the shop's AI budget |

The quota is **reserved** when the gate passes and **refunded** if the AI call fails, so a broken
provider does not consume the shop's daily turns.

The owner flips `ai_paused` from the dashboard:

```
PATCH /api/messenger/conversations/:id   { "aiPaused": true }
```

`GET/POST /webhooks/messenger` — the intake path — never changes this flag.

## Bot loop

`services/messenger/bot.service.js` turns one inbound message into one reply:

```
gate passes → assertCanSend() → load 20 stored messages → runToolLoop(role 'bot') → sendText → store
```

Rules:

- **Token check runs before the AI call.** Without a Page token the reply could be generated and
  then thrown away — a paid model call with nothing to show for it. `assertCanSend()` fails fast.
- The customer's text is wrapped in `<tin_nhan_khach>` as untrusted data; the prompt says anything
  inside those tags is data, never instructions. The bot's own past replies are not wrapped.
- History is the last 20 stored messages, so the bot sees what it already said.
- If the AI is unavailable the customer still gets one short honest message
  (`FALLBACK_REPLY`), and the quota reservation is refunded.
- An empty completion is not sent — no blank bubbles.

Step 3 has **no tools**: the bot can talk but cannot look up products or create orders. Those
arrive in step 4 and change only the `tools: []` array.

## Bot tools

`services/messenger/tools/bot.tools.js` — five tools, all scoped by `ctx` from the server
(`{ shopId, psid, conversationId }`), never from the model.

| Tool | Takes | Does |
|---|---|---|
| `search_products` | `query`, `limit` | Active products of this shop, with price and stock |
| `get_customer_profile` | — | Name, phone, address for the current PSID |
| `create_order` | `items[{productId, quantity, variant?}]`, `name`, `phone`, `address` | Creates the order, returns code + QR + total |
| `check_payment_status` | `paymentCode?` | Real status from the database |
| `handover_to_human` | `reason` | Sets `ai_paused = true` |

### The money rule

**`create_order` accepts no amount.** Prices, subtotal, shipping and total are read from
`products` and computed on the server. If the model could pass a number, a prompt injection could
sell a 500.000₫ item for 1.000₫.

Two details that make this hold:

- `SHIPPING_FEE` is a server constant, not a tool argument.
- `.strict()` is set on **each line item**, not only on the outer object. Zod does not inherit
  strictness into nested objects, so without this a `price` field could be smuggled into an item.
  There is a test for exactly that.

Other guards: a product from another shop is rejected; quantity above `stock` is rejected; the
customer's name/phone/address are saved back to `customers` after a successful order.

### Sending the QR

When `create_order` succeeds, the bot **also sends the VietQR image** into the chat, right after
its text reply (`qrFromToolCalls` + `replyImage` in `bot.service.js`).

- Only a successful `create_order` with `paymentReady` produces an image; a shop without a
  receiving account sends text only, never a broken image.
- The image call does **not** pass `inboundMid`. The dedupe check asks "has the bot already
  answered?", and the text reply just sent would make it skip the image. There is a test for it.
- A failed image does not fail the turn: the text already reached the customer, and the shop owner
  can resend the code by hand.
- The prompt tells the model the QR is sent automatically, so it must not promise "shop sẽ gửi mã".

## Sending a reply

`services/messenger/send.service.js` wraps the Send API:

| Function | Sends |
|---|---|
| `replyText` | plain text |
| `replyImage` | an image by public URL (the VietQR link) plus an optional caption |
| `replyQuickReplies` | text with up to 13 buttons |

Rules that matter:

- The Page token comes from `shops.fb_page_token`, falling back to `FB_PAGE_ACCESS_TOKEN`.
- A reply is stored in `messages` with `role = 'assistant'` **only after Meta confirms** it, so a
  failed send never leaves a phantom message.
- Meta allows a reply only within **24 hours** of the customer's last message. That case throws
  `MESSENGER_WINDOW_CLOSED` with a message the shop owner can act on, instead of a generic 500.
- A retried webhook must not send a second identical reply: `alreadyAnswered()` checks whether
  the last message in the conversation is the bot's answer to this exact inbound `mid`.



```bash
cd server
npm run backfill:messenger -- --shop <shop-uuid> --dry-run   # đếm trước, không ghi
npm run backfill:messenger -- --shop <shop-uuid>             # ghi thật
npm run backfill:messenger -- --page <fb-page-id>            # tra shop từ Page id
```

Tuỳ chọn: `--max-conversations 25`, `--max-per-conversation 20`.

Cần `FB_PAGE_ACCESS_TOKEN` trong `server/.env`, hoặc `shops.fb_page_token` của shop đó.

**Giới hạn của Meta, không phải của ta:** `/CONVERSATION-ID?fields=messages` trả **mọi** message id,
nhưng `/MESSAGE-ID?fields=message` chỉ trả nội dung cho **20 tin mới nhất**. Tin cũ hơn trả lỗi
"message has been deleted" — script đếm vào `expired`, không làm hỏng cả lượt chạy.

Shop `is_demo` bị từ chối: bản sao demo dùng chung Page của shop mẫu và dữ liệu là tạm.

## Ghi chú chính sách

Messaging window: được **trả lời** trong 24 giờ kể từ tin cuối của khách (7 ngày nếu hội thoại
bắt đầu từ Click-to-Messenger ads). Đọc và lưu tin thì không bị giới hạn này, nhưng bot trả lời
muộn sẽ bị Meta chặn.

## Test

```bash
cd server && node --test test/messenger.ingest.test.js
```

6 test, chạy thật trên PostgreSQL: lưu tin mới, chống trùng theo `mid`, postback, tệp đính kèm,
shop không xác định không ghi nhầm, và hàm tách text.

## Không dùng thư viện ngoài

Graph API chỉ là REST + query string. `services/messenger/graph.client.js` dùng `fetch` có sẵn của
Node, giống `services/ai/client.js` gọi LLM. Các package như `messaging-api-messenger` (4 năm) và
`fb-messenger-bot-api` (5 năm) đã ngừng cập nhật.

## Biến môi trường

| Biến | Dùng cho |
|---|---|
| `FB_APP_SECRET` | Xác thực chữ ký webhook (bắt buộc để nhận tin thật) |
| `FB_VERIFY_TOKEN` | Bắt tay GET khi đăng ký webhook với Meta |
| `FB_PAGE_ACCESS_TOKEN` | Chỉ cần cho backfill lịch sử |
| `GRAPH_API_VERSION` | Mặc định `v23.0` |
| `SIM_WEBHOOK_SECRET` | HMAC cho `/webhooks/sim` (khung mô phỏng) |
