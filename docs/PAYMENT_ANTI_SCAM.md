# Xác minh thanh toán và chống scam

## Nguyên tắc cốt lõi
**Nguồn sự thật duy nhất là webhook biến động số dư từ SePay.** Ảnh chụp màn hình, tin nhắn "đã chuyển" hay bill do khách gửi đều **không** được dùng để xác nhận đơn, vì đây là kiểu lừa đảo phổ biến nhất (bill giả, bill chỉnh sửa).

## Sinh mã thanh toán
- Mỗi đơn có `payment_code` duy nhất, prefix cố định + chuỗi ngẫu nhiên, vd. `DH8F3K2A` (bỏ các ký tự dễ nhầm như `0/O`, `1/I`).
- Cấu hình cùng prefix trong SePay (*Cấu trúc mã thanh toán*). Khi bật tùy chọn "chỉ gửi khi có mã thanh toán", SePay chỉ bắn webhook cho giao dịch có mã.
- Gửi khách ảnh VietQR có sẵn số tiền + nội dung, để khách khỏi phải gõ tay và gõ sai.

## Checklist xử lý webhook `POST /webhooks/sepay`

1. **Xác thực:** header `Authorization` phải đúng `Apikey <SEPAY_WEBHOOK_API_KEY>` (so sánh bằng `crypto.timingSafeEqual`).
2. **Lưu raw payload** vào `payment_transactions` với `sepay_id UNIQUE`. Nếu đã tồn tại (SePay retry) → trả `200`, không xử lý lại.
3. **Chỉ xử lý** `transferType === "in"`.
4. **Đúng tài khoản:** `accountNumber` phải bằng `shops.bank_account_number`.
5. **Tìm đơn:** theo `code`; nếu `code` null thì regex `payment_code` trong `content`. Không tìm thấy → `match_status = NO_ORDER` (để chủ shop gán tay).
6. **Đơn phải đang `AWAITING_PAYMENT`.** Đơn đã `PAID` mà vẫn nhận thêm tiền → đánh dấu để chủ shop kiểm tra.
7. **Đúng số tiền:** `transferAmount >= orders.total`. Thiếu → `UNDERPAID`, nhắn khách chuyển phần còn thiếu.
8. Trong **một DB transaction**: đơn → `PAID`, `paid_at = now()`, ghi `ledger_entries` INCOME, trừ tồn kho.
9. Gửi tin xác nhận cho khách qua Messenger. Báo chủ shop trên dashboard.
10. Trả `200 { success: true }`.

## Tăng độ tin cậy (tùy chọn)
- Gọi API giao dịch của SePay để đối chiếu lại `referenceCode` trước khi xác nhận đơn giá trị lớn.
- Đơn quá `expires_at` (vd. 30 phút) mà chưa thanh toán → `EXPIRED`, hoàn lại tồn kho giữ chỗ.
- Cảnh báo chủ shop nếu một PSID tạo nhiều đơn mà không thanh toán.

## Test với SePay Test mode
SePay có Test mode để giả lập giao dịch mà không cần chuyển tiền thật. Dùng nó để test các case: khớp đủ tiền, thiếu tiền, sai mã, gửi trùng `id`.

## Tham khảo
- Payload và xác thực API Key: https://developer.sepay.vn/en/sepay-webhooks/tich-hop-webhook
- Checklist bảo mật (số tiền, số tài khoản, mã thanh toán): https://developer.sepay.vn/en/sepay-webhooks/bao-mat
- Tùy chọn "chỉ gửi khi có mã thanh toán": https://developer.sepay.vn/en/sepay-webhooks/tao-webhook
- Chống trùng bằng `sepay_id UNIQUE`, dùng BIGINT cho tiền: https://developer.sepay.vn/vi/sepay-webhooks/lap-trinh-webhook
- Test mode: https://developer.sepay.vn/en/sepay-webhooks/test-mode/bat-dau-nhanh
