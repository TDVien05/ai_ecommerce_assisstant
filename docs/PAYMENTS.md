# Thanh toán nhiều shop (mô hình A)

Mỗi shop tự kết nối tài khoản cổng thanh toán của **chính họ** (SePay). Tiền về thẳng
tài khoản ngân hàng của shop, **không qua tài khoản của nền tảng**.

Nhờ vậy nền tảng **không cần giấy phép trung gian thanh toán** (thu hộ/chi hộ) theo
Nghị định 52/2024/NĐ-CP. Đó là lý do chọn mô hình này.

> Mô hình thu hộ (tiền vào tài khoản nền tảng rồi trả lại shop) **bắt buộc** phải có
> giấy phép trung gian thanh toán do Ngân hàng Nhà nước cấp.

## Vì sao phải là secret theo từng shop

SePay là cổng **per-business**: mỗi shop đăng ký tài khoản SePay riêng, liên kết tài khoản
ngân hàng riêng, và webhook của họ ký bằng secret riêng. Một secret toàn cục không thể verify
được webhook của nhiều shop — vì vậy `shops.sepay_webhook_secret` lưu secret **từng shop**.

## Luồng

```
1. Shop tạo webhook trên SePay, chọn HMAC-SHA256 → nhận secret
2. PUT /api/shop/payment { secret }        (JWT của shop)
   → mã hoá AES-256-GCM → shops.sepay_webhook_secret
   → trả về webhookPath để shop dán vào SePay
3. Khách chuyển khoản → SePay POST /webhooks/sepay/:shopId
   → tra secret của shop đó → giải mã → verify HMAC
   → ingest với shopId đã được chứng minh (không đoán từ payload)
```

## API

| Method | Path | Việc |
|---|---|---|
| `GET` | `/api/shop/payment` | Trạng thái: `hasSecret`, `secretMask` (4 ký tự cuối), `webhookPath` |
| `PUT` | `/api/shop/payment` | Đặt/thay secret: `{ secret, provider }` |
| `DELETE` | `/api/shop/payment` | Xoá secret (shop ngừng nhận webhook) |

Secret **không bao giờ** trả về dạng plaintext. Chỉ `****abcd`.

## Bảo mật

| Lớp | Cách làm |
|---|---|
| Lưu trữ | AES-256-GCM, key từ `APP_ENCRYPTION_KEY`; envelope `v1:iv:tag:data` |
| Chống sửa | GCM auth tag — sửa ciphertext là decrypt ném lỗi |
| Chống replay | `X-SePay-Timestamp` lệch quá ±300 giây → 401 |
| Chống giả mạo | HMAC trên **raw body**; parse trước khi verify là hỏng chữ ký |
| Cách ly tenant | `shopId` lấy từ URL đã verify, **không** lấy từ payload |
| So sánh | `crypto.timingSafeEqual` |

**Cảnh báo:** đổi `APP_ENCRYPTION_KEY` thì phải mã hoá lại toàn bộ secret đã lưu.

## Đường legacy

`POST /webhooks/sepay` (không có `shopId`) vẫn chạy với secret toàn cục `SEPAY_WEBHOOK_SECRET`,
hoặc API key nếu không đặt secret. Giữ cho cài đặt một shop và shop mẫu đã seed.

## Test

```bash
cd server && node --test test/shop.payment-secret.test.js
```

8 test: mã hoá/giải mã, phát hiện envelope bị sửa, **shop A không verify được bằng secret shop B**,
gắn đúng shop, shop chưa cấu hình → 503, không lộ plaintext qua API, thiếu header / timestamp cũ.
