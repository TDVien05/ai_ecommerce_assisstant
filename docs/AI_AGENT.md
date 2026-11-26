# AI Agent

## Nguyên tắc
- LLM **chỉ quyết định nói gì và gọi tool nào**. Giá, tồn kho, tổng tiền, trạng thái thanh toán luôn lấy từ DB qua tool, LLM không được tự tính hay tự bịa.
- LLM **không có tool nào để đánh dấu đơn đã thanh toán**. Chỉ webhook SePay mới làm được việc này.
- Provider-agnostic: `ai.service` nhận `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` từ env và dùng format chat-completions có `tools`.
- Lịch sử gửi lên LLM: khoảng 20 tin gần nhất + tóm tắt thông tin khách (tên, SĐT, địa chỉ đã biết).

## System prompt (bản nháp)

```
Bạn là nhân viên bán hàng của shop "{shop_name}" trên Facebook Messenger.
- Trả lời tiếng Việt, ngắn gọn, thân thiện, xưng "shop", gọi khách là "bạn".
- Chỉ tư vấn sản phẩm có trong kết quả tool search_products. Không bịa giá, khuyến mãi hay tồn kho.
- Để tạo đơn cần đủ: sản phẩm + biến thể + số lượng, họ tên, số điện thoại, địa chỉ.
  Thiếu thông tin nào thì hỏi thông tin đó. Trước khi gọi create_order, tóm tắt đơn và hỏi khách xác nhận.
- Sau khi tạo đơn, nhắc khách chuyển khoản ĐÚNG số tiền và ĐÚNG nội dung là mã đơn.
- Nếu khách nói đã chuyển khoản hoặc gửi ảnh biên lai: gọi check_payment_status.
  Nếu chưa PAID, trả lời là hệ thống đang chờ ngân hàng xác nhận. KHÔNG bao giờ tự xác nhận đã nhận tiền.
- Khách phàn nàn, đòi hoàn tiền, hoặc câu hỏi ngoài phạm vi: gọi handover_to_human.
```

## Tools

| Tool | Input | Output | Ghi chú |
|---|---|---|---|
| `search_products` | `{ query, size?, color? }` | `[{ id, name, price, stock, variants, image_url }]` | Chỉ trả về sản phẩm active |
| `get_customer_profile` | `{}` | `{ name, phone, address }` | Dùng PSID hiện tại, LLM không truyền PSID |
| `create_order` | `{ items: [{ productId, variant, quantity }], name, phone, address }` | `{ orderId, paymentCode, total, qrImageUrl }` | Server tự tính tổng, kiểm tồn kho, validate SĐT |
| `check_payment_status` | `{ paymentCode? }` | `{ status, paidAmount, total }` | Mặc định là đơn mới nhất của khách |
| `cancel_order` | `{ paymentCode }` | `{ status }` | Chỉ hủy được khi đang `AWAITING_PAYMENT` |
| `handover_to_human` | `{ reason }` | `{ ok }` | Đặt `ai_paused=true` + báo chủ shop |

### Trợ lý tài chính (cho chủ shop, endpoint `/api/finance/ask`)

| Tool | Input |
|---|---|
| `get_summary` | `{ from, to }` |
| `get_timeseries` | `{ from, to, interval }` |
| `get_top_products` | `{ from, to, limit }` |
| `list_expenses` | `{ from, to, category? }` |

Server tự viết các câu SQL đứng sau tool. LLM không sinh SQL. LLM chỉ diễn giải số liệu tool trả về, và mọi con số trong câu trả lời phải lấy từ output của tool.

## Guardrails
- Validate input tool bằng schema (vd. zod) trước khi chạy. Input sai → trả lỗi về LLM để nó hỏi lại khách.
- Giới hạn số vòng tool-call mỗi tin nhắn (vd. tối đa 5).
- `ai_paused = true` → không gọi LLM, chỉ lưu tin nhắn.
- Log toàn bộ tool call và kết quả để debug và đánh giá chất lượng.

## Bộ test hội thoại tối thiểu
1. Hỏi sản phẩm có trong kho → trả đúng giá.
2. Hỏi sản phẩm không có → không bịa.
3. Đặt hàng thiếu địa chỉ → AI hỏi địa chỉ.
4. Đặt hàng đủ thông tin → tóm tắt, hỏi xác nhận, rồi mới `create_order`.
5. "Mình chuyển rồi nha" + ảnh, nhưng chưa có webhook → AI không xác nhận.
6. Webhook khớp → khách nhận tin xác nhận.
7. Khách chửi hoặc đòi hoàn tiền → handover.
