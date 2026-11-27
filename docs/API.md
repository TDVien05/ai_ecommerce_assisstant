# API

Base URL: `http://localhost:4000`. Response lỗi thống nhất: `{ "error": { "code": "STRING", "message": "..." } }`.

## 1. Webhook Messenger

### `GET /webhooks/messenger` — xác minh endpoint
Meta gửi query `hub.mode=subscribe`, `hub.verify_token`, `hub.challenge`.
Nếu `hub.verify_token === FB_VERIFY_TOKEN` → trả `200` với body là giá trị `hub.challenge` (plain text). Ngược lại → `403`.

### `POST /webhooks/messenger` — nhận sự kiện
- Header `X-Hub-Signature-256: sha256=<hex>`: HMAC-SHA256 của **raw body**, key là `FB_APP_SECRET`. Phải verify trên raw bytes (dùng `express.raw()` hoặc `express.json({ verify })` để giữ raw body); chữ ký sai → `403`.
- Trả `200` ngay, xử lý bất đồng bộ.
- Payload: `{ object: "page", entry: [{ id: PAGE_ID, messaging: [{ sender: { id: PSID }, message: { mid, text, attachments? } }] }] }`
- Bỏ qua: `message.is_echo === true`, event `delivery`/`read`, `mid` đã xử lý.

### Gửi tin (outbound, Send API)
```
POST https://graph.facebook.com/{GRAPH_API_VERSION}/me/messages?access_token={PAGE_ACCESS_TOKEN}
{ "recipient": { "id": "<PSID>" }, "messaging_type": "RESPONSE", "message": { "text": "..." } }
```
Gửi ảnh QR: `message.attachment = { type: "image", payload: { url, is_reusable: true } }`.

## 2. Webhook SePay

### `POST /webhooks/sepay`
- Header: `Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>`; sai → `401`.
- Body mẫu:
```json
{
  "id": 92704,
  "gateway": "Vietcombank",
  "transactionDate": "2024-07-02 11:08:33",
  "accountNumber": "1017588888",
  "code": "DH8F3K2A",
  "content": "DH8F3K2A chuyen tien",
  "transferType": "in",
  "transferAmount": 250000,
  "accumulated": 19077000,
  "subAccount": null,
  "referenceCode": "FT24012345678",
  "description": ""
}
```
- Thành công → `200 { "success": true }`. Quy tắc đối soát: [PAYMENT_ANTI_SCAM.md](PAYMENT_ANTI_SCAM.md).

## 3. REST API cho dashboard (`/api`, yêu cầu JWT của chủ shop)

### Auth
| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/auth/login` | `{ email, password }` → `{ token }` |
| POST | `/api/auth/register` | `{ ownerName, shopName, email, password, acceptedTerms: true }` → `201 { token }`; email đã dùng → `409 EMAIL_EXISTS` |
| POST | `/api/auth/demo` | Không cần body → `{ token }` của tài khoản demo cấu hình ở máy chủ |
| GET | `/api/auth/me` | thông tin shop hiện tại |

Đăng ký và demo có giới hạn tần suất. `GET /api/auth/me` trả `user` (bao gồm `ownerName`, có thể null) và `shop` (bao gồm `isDemo`). Mật khẩu demo không được gửi tới trình duyệt.

### Sản phẩm
| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/products?q=&page=` | danh sách |
| POST | `/api/products` | tạo |
| PATCH | `/api/products/:id` | sửa |
| DELETE | `/api/products/:id` | ẩn (`is_active=false`) |

### Đơn hàng
| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/orders?status=&from=&to=` | danh sách |
| GET | `/api/orders/:id` | chi tiết + items + giao dịch thanh toán |
| PATCH | `/api/orders/:id/status` | `{ status: "SHIPPING" \| "COMPLETED" \| "CANCELLED" }` |

### Hội thoại
| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/conversations` | danh sách hội thoại |
| GET | `/api/conversations/:id/messages` | lịch sử |
| POST | `/api/conversations/:id/messages` | chủ shop gửi tin tay |
| PATCH | `/api/conversations/:id` | `{ ai_paused: true }`: tắt AI cho hội thoại này |

### Thanh toán
| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/payments?match_status=` | giao dịch SePay, lọc `UNDERPAID` / `NO_ORDER` để xử lý tay |
| POST | `/api/payments/:id/assign` | `{ orderId }`: gán tay giao dịch cho đơn |
| DELETE | `/api/payments/:id/assign` | hoàn tác gán tay (cần server làm, xem dưới) |

Dạng JSON giao diện đang dùng (đề xuất) nằm trong `client/src/lib/payments/types.ts`. `GET /api/payments` trả `{ items: Payment[] }`; danh sách đơn để gán (`GET /api/orders?status=AWAITING_PAYMENT`) cần `{ items: [{ id, paymentCode, customerName, total }] }`.

#### `DELETE /api/payments/:id/assign` (hoàn tác gán tay)

- Request: không có body. `:id` là id của `payment_transactions`.
- Server đặt `order_id = null`, `match_status = NO_ORDER`.
- Response `200`:

```json
{
  "payment": {
    "id": "p2",
    "gateway": "Vietcombank",
    "accountNumber": "1017588888",
    "code": null,
    "content": "NGUYEN THI HOA chuyen tien ao",
    "referenceCode": "FT24012345678",
    "transferType": "in",
    "transferAmount": 320000,
    "transactionDate": "2026-11-27T05:03:00.000Z",
    "orderId": null,
    "orderCode": null,
    "shortfall": null,
    "matchStatus": "NO_ORDER"
  }
}
```

- Lỗi: `404 PAYMENT_NOT_FOUND`; `409 PAYMENT_NOT_UNASSIGNABLE` khi giao dịch không phải do gán tay (khớp tự động từ webhook) hoặc đơn đã đi tiếp sau `PAID` (giao hàng, hoàn tiền).

#### Gán tay và hoàn tác đổi gì

| Trường hợp | `POST .../assign` | `DELETE .../assign` |
|---|---|---|
| Đủ tiền (`transferAmount >= total`) | Giống luồng webhook: đơn `AWAITING_PAYMENT` → `PAID` (giao diện ghi "Đã duyệt"), ghi một bút toán thu `INCOME/SALES` vào `ledger_entries`, ghi nhật ký hoàn tác. `match_status = MATCHED` | Đơn trở về `AWAITING_PAYMENT` (xóa `paid_at`), xóa bút toán đó |
| Thiếu tiền | Không đổi trạng thái đơn, không ghi sổ, chỉ ghi nhận thanh toán một phần. `match_status = UNDERPAID` | Gỡ giao dịch khỏi đơn |

- Mỗi lần gán hoặc hoàn tác chạy trong một DB transaction.
- Luồng webhook cũng trừ tồn kho khi đơn sang `PAID` ([PAYMENT_ANTI_SCAM.md](PAYMENT_ANTI_SCAM.md)), nên gán đủ tiền trừ tồn kho và hoàn tác cộng lại.
- Nhật ký hoàn tác chưa có bảng trong [DATABASE.md](DATABASE.md); cần lưu ít nhất giao dịch, đơn, bút toán và thời điểm gán.
- Chuyển `PAID` → `AWAITING_PAYMENT` chỉ xảy ra khi hoàn tác gán tay. AI không có công cụ nào gọi hai API này.

### Tài chính
| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/finance/summary?from=&to=` | `{ revenue, cost, grossProfit, expenses, netProfit, orderCount, aov }` |
| GET | `/api/finance/timeseries?from=&to=&interval=day` | doanh thu theo ngày/tuần |
| GET | `/api/finance/top-products?from=&to=&limit=5` | sản phẩm bán chạy |
| GET | `/api/finance/ledger` | sổ thu chi |
| POST | `/api/finance/ledger` | thêm khoản chi tay `{ type: "EXPENSE", category, amount, note, occurredAt }` |
| POST | `/api/finance/ask` | `{ question }` → `{ answer, data }` (trợ lý tài chính AI) |

## Tham khảo
- Messenger Webhooks: https://developers.facebook.com/docs/messenger-platform/webhooks
- Messenger Quick Start (Send API, page access token): https://developers.facebook.com/documentation/business-messaging/messenger-platform/getting-started/quick-start
- SePay Webhook: https://developer.sepay.vn/en/sepay-webhooks/tich-hop-webhook
