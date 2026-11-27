# Kiến trúc

## Tổng quan

```mermaid
flowchart LR
  KH[Khách hàng<br/>Messenger] -->|tin nhắn| META[Meta Messenger Platform]
  META -->|POST webhook| API[Express Server]
  API -->|Send API| META
  API <--> LLM[LLM Provider]
  API <--> DB[(PostgreSQL)]
  BANK[Ngân hàng] --> SEPAY[SePay]
  SEPAY -->|POST webhook biến động số dư| API
  OWNER[Chủ shop] --> WEB[React Dashboard]
  WEB -->|REST /api| API
```

## Phân lớp backend

```
request → routes/ → middlewares/ → controllers/ → services/ → db/
                                        ↓ lỗi (throw HttpError)
                                   errorHandler → { error: { code, message } }
```

| Lớp | Được làm | Không được làm |
|---|---|---|
| `routes/` | Khai báo method + path, gắn middleware (verify chữ ký/API key, body parser, `validate(schema)`), trỏ tới controller | Viết handler inline, gọi service/db |
| `controllers/` | Đọc `req.body` / `req.params` / `req.validatedQuery`, gọi service, chọn status code, trả JSON | Business logic, tính tiền, mở transaction, truy cập `db/` |
| `services/` | Business logic, transaction (đổi trạng thái đơn + ghi sổ + trừ kho), gọi API ngoài, gọi `db/` | Đọc `req` / ghi `res` |
| `db/` | Pool kết nối, migration | |

Quy ước tên: `routes/orders.js` → `controllers/orders.controller.js` → `services/order.service.js`.
Controller là hàm async; lỗi được Express 5 tự chuyển tới `errorHandler`, nên không bọc try/catch.

Ví dụ:

```js
// routes/orders.js
ordersRouter.post('/', validate(createOrderBody), ordersController.create)

// controllers/orders.controller.js
export const create = async (req, res) => {
  res.status(201).json(await orderService.create(req.body))
}
```

## Module backend

| Module | Trách nhiệm |
|---|---|
| `messenger.service` | Parse webhook event, gửi tin nhắn (text, ảnh QR, quick replies) qua Send API |
| `ai.service` | Gọi LLM, giữ lịch sử hội thoại, thực thi các tool (`search_products`, `create_order`…) |
| `order.service` | Tạo/cập nhật đơn, sinh mã thanh toán duy nhất, quản lý vòng đời trạng thái |
| `payment.service` | Nhận webhook SePay, đối soát giao dịch với đơn, chống trùng, đánh dấu PAID |
| `finance.service` | Ghi sổ thu chi, tổng hợp báo cáo, trả lời câu hỏi tài chính của chủ shop |

## Luồng 1 — Khách nhắn tin → AI trả lời

```mermaid
sequenceDiagram
  participant C as Khách
  participant M as Meta
  participant S as Server
  participant AI as LLM
  C->>M: "Áo thun trắng size M còn không?"
  M->>S: POST /webhooks/messenger (X-Hub-Signature-256)
  S->>S: Xác thực chữ ký, trả 200 ngay
  S->>S: Lưu message, lấy lịch sử hội thoại
  S->>AI: messages + tools
  AI-->>S: tool_call search_products("áo thun trắng", size M)
  S->>S: Query DB
  S->>AI: kết quả tool
  AI-->>S: Câu trả lời
  S->>M: Send API (recipient = PSID)
  M->>C: Tin nhắn trả lời
```

Lưu ý: trả `200` cho Meta trước, xử lý AI **bất đồng bộ** (tránh timeout/retry gây trả lời trùng). Chống trùng bằng `message.mid`.

## Luồng 2 — Tạo đơn + thanh toán + chống scam

```mermaid
sequenceDiagram
  participant C as Khách
  participant S as Server
  participant SP as SePay
  C->>S: Chốt đơn (tên, SĐT, địa chỉ, sản phẩm)
  S->>S: create_order → status AWAITING_PAYMENT, payment_code = DH8F3K2A
  S->>C: Tóm tắt đơn + ảnh VietQR (số tiền + nội dung DH8F3K2A)
  C->>C: Chuyển khoản
  SP->>S: POST /webhooks/sepay (Authorization: Apikey ...)
  S->>S: Đối soát: code, số tiền, số tài khoản, chống trùng id
  S->>S: Đơn → PAID, ghi giao dịch thu vào finance
  S->>C: "Đã nhận đủ 250.000đ, đơn DH8F3K2A đã xác nhận"
```

Nếu khách gửi ảnh chụp màn hình "đã chuyển khoản" mà chưa có webhook → AI trả lời là hệ thống đang chờ ngân hàng xác nhận, **không** xác nhận đơn. Chi tiết: [PAYMENT_ANTI_SCAM.md](PAYMENT_ANTI_SCAM.md).

## Luồng 3 — Trợ lý tài chính

```mermaid
sequenceDiagram
  participant O as Chủ shop
  participant W as Dashboard
  participant S as Server
  participant AI as LLM
  O->>W: "Tuần này lời bao nhiêu? Món nào bán chạy?"
  W->>S: POST /api/finance/ask
  S->>AI: câu hỏi + tools (get_summary, get_top_products)
  AI-->>S: tool_call get_summary(from, to)
  S->>S: SQL tổng hợp (do server viết, không để LLM tự sinh SQL)
  S->>AI: số liệu
  AI-->>S: Câu trả lời kèm số liệu
  S->>W: { answer, data }
```

## Tài liệu tham khảo

- Meta Messenger Webhooks: https://developers.facebook.com/docs/messenger-platform/webhooks
- SePay Webhooks: https://developer.sepay.vn/en/sepay-webhooks/tich-hop-webhook
