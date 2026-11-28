# Flowy

![Trang giới thiệu Flowy](docs/images/landing.png)

Flowy là trợ lý vận hành dòng tiền dành cho hộ kinh doanh, kết hợp giao diện quản lý và các luồng hỗ trợ bằng AI.

## Vấn đề và giải pháp

Hộ kinh doanh trực tuyến thường theo dõi đơn hàng, giao dịch và thu chi trên nhiều kênh. Việc đối chiếu thủ công mất thời gian và có thể bỏ sót thông tin khi xử lý đơn hoặc ghi sổ.

Flowy hướng tới việc tập trung các thông tin này trong một giao diện, hỗ trợ nhận diện tình huống cần kiểm tra và trình bày công việc để chủ hộ xem xét. Các thay đổi do AI đề xuất được thiết kế để người dùng duyệt trước khi thực hiện và có thể hoàn tác.

**Trạng thái dự án:** sản phẩm đang phát triển. Chat, sổ thu chi, đơn hàng và cảnh báo đã có kết nối máy chủ khi bật mô-đun tương ứng. Một số trang vẫn dùng dữ liệu giả lập; chưa sử dụng số liệu giả lập làm căn cứ vận hành hoặc kê khai.

## Tính năng chính

| Tính năng | Trạng thái |
|---|---|
| **Chat trung tâm và luồng việc** | Đọc sổ, đơn hàng; đề xuất thay đổi cần duyệt và hỗ trợ hoàn tác. Nhập sao kê CSV có bộ đọc và phân loại tạm, cần kiểm tra định dạng trước khi dùng. |
| **Quản lý thu chi và đơn hàng** | Có API máy chủ và giao diện kết nối khi cấu hình `VITE_REAL_API`. Báo cáo yêu cầu dữ liệu phân loại và giá vốn đầy đủ; đối soát giao dịch đang phát triển. |
| **Mẫu sổ theo Thông tư 152/2025/TT-BTC** | Có xem trước và xuất PDF/Excel bằng dữ liệu giả lập; mẫu cần đối chiếu bản gốc trước khi sử dụng. |
| **Cảnh báo rủi ro** | Hiển thị và xử lý cảnh báo từ máy chủ; nguồn phát hiện gian lận tự động đang phát triển. |
| **Bot Messenger** | Giao diện giả lập; kết nối Messenger đầu cuối đang phát triển. |

Hạn mức trợ lý hiện lưu trong bộ nhớ của từng tiến trình máy chủ và đặt lại khi khởi động lại; cần cơ chế dùng chung, bền vững trước khi mở bản công khai. Tệp dữ liệu demo và thông tin xác thực không được đưa vào kho mã.

## Kiến trúc và công nghệ

```text
Trình duyệt
    │
    ▼
React + Vite + shadcn/ui ── HTTP ──► Express 5 ──► PostgreSQL
        │                                │
        └── Một số màn hình dùng mẫu     ├── Lớp AI / nhà cung cấp mô hình
                                         ├── Meta Messenger (đang phát triển)
                                         └── SePay (đang phát triển)
```

| Thành phần | Công nghệ và phạm vi |
|---|---|
| Giao diện | React, TypeScript, Vite, Tailwind CSS và shadcn/ui; hệ thống thiết kế Flowy trong `client/`. |
| Máy chủ | Node.js và Express 5; xác thực, kiểm tra trạng thái, các tuyến webhook và lớp tích hợp AI. |
| Cơ sở dữ liệu | PostgreSQL; schema và migration nằm trong `server/src/db/`. |
| AI | Lớp gọi nhà cung cấp tương thích OpenAI, chế độ giả lập, công cụ đọc và đề xuất cần duyệt; bảo vệ nâng cao và hạn mức bền vững đang phát triển. |
| Thanh toán và nhắn tin | SePay và Meta Messenger là các tích hợp đang phát triển; webhook SePay chưa thực hiện đối soát. |

Tài liệu kỹ thuật bổ sung: [Kiến trúc](docs/ARCHITECTURE.md), [API](docs/API.md), [Cơ sở dữ liệu](docs/DATABASE.md) và [Hệ thống thiết kế](docs/design-system/README.md).

## Chạy bằng Docker Compose

Yêu cầu: Docker Engine và Docker Compose. Các lệnh dưới đây thực hiện tại thư mục gốc của dự án.

1. Tạo tệp cấu hình máy chủ từ mẫu và điều chỉnh các giá trị cần thiết trên máy cục bộ:

   ```bash
   cp server/.env.example server/.env
   ```

   Trên PowerShell, có thể dùng `Copy-Item server/.env.example server/.env`. Thiết lập `JWT_SECRET` phù hợp trước khi sử dụng; các khóa tích hợp chỉ được cấu hình khi cần.

2. Khởi động ứng dụng:

   ```bash
   docker compose up -d --build
   ```

3. Truy cập giao diện tại [http://localhost:5173](http://localhost:5173). Máy chủ lắng nghe tại `http://localhost:4000`; PostgreSQL sử dụng cổng `5432` theo mặc định. Compose tự chạy migration máy chủ khi khởi động.

Một số lệnh phục vụ phát triển:

```bash
docker compose ps
docker compose logs -f server
docker compose exec client npm run build
docker compose exec client npm run lint
docker compose exec server npm test
docker compose down
```

## Cấu trúc thư mục

```text
.
├── client/                 Giao diện React, component và các lớp API
├── server/                 Express API, dịch vụ, xác thực và migration
│   └── src/
│       ├── app.js          Điểm khởi động: đăng ký middleware, router và chạy máy chủ
│       ├── controllers/    Xử lý yêu cầu và phản hồi, chia thư mục theo tính năng
│       ├── db/             Kết nối PostgreSQL, transaction, migration và seed
│       ├── errors/         Lớp lỗi, bảng mã lỗi và trạng thái HTTP, chuyển mọi lỗi về một dạng
│       ├── middlewares/    Xác thực, chữ ký webhook, giới hạn tần suất và xử lý lỗi
│       ├── models/         Model TypeORM cho từng bảng, chia thư mục theo tính năng
│       ├── repositories/   Truy vấn dữ liệu, mỗi bảng một tệp (vd. orders/order.repository.js)
│       ├── routes/         Định tuyến API và webhook, chia thư mục theo tính năng
│       ├── services/       Nghiệp vụ theo tính năng (ai/, assistant/, auth/, finance/…)
│       └── validators/     Schema zod cho đầu vào của từng route, chia thư mục theo tính năng
├── docs/                   Tài liệu kỹ thuật và hệ thống thiết kế
├── docker-compose.yml      Môi trường phát triển bằng Docker
└── Dockerfile              Cấu hình ảnh ứng dụng
```

## Biến môi trường

Danh sách và hướng dẫn cấu hình nằm trong [server/.env.example](server/.env.example), [client/.env.example](client/.env.example) và [.env.example](.env.example) ở thư mục gốc. Các nhóm cấu hình gồm cơ sở dữ liệu, JWT, AI, SePay và Messenger.

Không đưa tệp `.env`, khóa, mật khẩu hoặc token vào kho mã. Biến có tiền tố `VITE_` được đưa vào mã phía trình duyệt và không được chứa thông tin bí mật.

## Nhóm FearOfUnemployment

| Thành viên | Vai trò |
|---|---|
| Duy | Giao diện sản phẩm, xác thực và tích hợp ứng dụng. |
| Thịnh | Máy chủ, cơ sở dữ liệu, webhook và đối soát thanh toán. |
| Viên | Lớp AI và tích hợp mô hình. |
