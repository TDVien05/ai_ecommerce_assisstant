# AI Agent

## Principles
- The LLM **only decides what to say and which tool to call**. Prices, stock, totals and payment status always come from the DB through tools; the LLM never calculates or makes them up.
- The LLM **has no tool to mark an order as paid**. Only the SePay webhook can do that.
- Provider-agnostic: `ai.service` reads `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` from env and uses the chat-completions format with `tools`.
- History sent to the LLM: roughly the last 20 messages + a summary of the customer's known details (name, phone, address).

## Messenger system prompt (draft; đang phát triển)

```
You are a sales assistant for the shop "{shop_name}" on Facebook Messenger.
- Reply in Vietnamese, briefly and warmly. Refer to yourself as "shop" and address the customer as "bạn".
- Only recommend products returned by the search_products tool. Never invent prices, promotions or stock.
- To create an order you need: product + variant + quantity, full name, phone number, address.
  Ask for whatever is missing. Before calling create_order, summarize the order and ask the customer to confirm.
- After creating the order, remind the customer to transfer the EXACT amount with the order code as the EXACT transfer note.
- If the customer says they have paid or sends a receipt photo: call check_payment_status.
  If it is not PAID yet, say the system is waiting for the bank's confirmation. NEVER confirm receipt of money yourself.
- Complaints, refund requests, or out-of-scope questions: call handover_to_human.
```

## Messenger tools (dự kiến)

| Tool | Input | Output | Notes |
|---|---|---|---|
| `search_products` | `{ query, size?, color? }` | `[{ id, name, price, stock, variants, image_url }]` | Returns active products only |
| `get_customer_profile` | `{}` | `{ name, phone, address }` | Uses the current PSID; the LLM never passes a PSID |
| `create_order` | `{ items: [{ productId, variant, quantity }], name, phone, address }` | `{ orderId, paymentCode, total, qrImageUrl }` | The server computes the total, checks stock, validates the phone number |
| `check_payment_status` | `{ paymentCode? }` | `{ status, paidAmount, total }` | Defaults to the customer's latest order |
| `cancel_order` | `{ paymentCode }` | `{ status }` | Only allowed while `AWAITING_PAYMENT` |
| `handover_to_human` | `{ reason }` | `{ ok }` | Sets `ai_paused=true` + notifies the shop owner |

### Trợ lý dành cho chủ cửa hàng

Trợ lý nhận tin tại `POST /api/assistant/messages` và gửi kết quả qua SSE. Công cụ hiện có: `get_summary`, `list_ledger`, `get_activity`, `export_ledger_book`, `list_orders`, `get_order`, đề xuất `add_ledger_entries`, `delete_manual_entry`, `update_order_status` và đổi tên cửa hàng. Giao dịch chưa đối soát và thay đổi thông tin ngân hàng chưa hỗ trợ.

Thay đổi dữ liệu chỉ được thực hiện sau khi người dùng duyệt và có thể hoàn tác nếu dữ liệu chưa thay đổi tiếp. Không có công cụ xác nhận thanh toán. Bộ đọc CSV tạm nhận ngày, mô tả và số tiền; dòng nghi ngờ hoặc phân loại không chắc phải được người dùng chọn.

Giới hạn mặc định là 50 yêu cầu được chấp nhận mỗi cửa hàng mỗi ngày (`AI_DAILY_RUN_LIMIT`), tính cả nhập sao kê. Bộ đếm lưu trong bộ nhớ từng tiến trình, đặt lại sau khởi động, chưa thay thế giới hạn chi phí tại nhà cung cấp hoặc bộ đếm bền vững. Chế độ luật dự phòng và lớp bảo vệ đầy đủ đang phát triển.

## Guardrails
- Validate tool input against a schema (e.g. zod) before running it. Invalid input → return the error to the LLM so it can ask the customer again.
- Cap the number of tool-call rounds per message (e.g. at most 5).
- `ai_paused = true` → don't call the LLM, only store the message.
- Log every tool call and its result for debugging and quality evaluation.

## Minimum conversation test set
1. Ask about an in-stock product → correct price.
2. Ask about a product that doesn't exist → nothing invented.
3. Order without an address → the AI asks for the address.
4. Order with complete details → summary, asks for confirmation, only then `create_order`.
5. "Mình chuyển rồi nha" ("I've paid") + a photo, but no webhook yet → the AI does not confirm.
6. Matching webhook → the customer receives a confirmation message.
7. The customer is abusive or demands a refund → handover.
