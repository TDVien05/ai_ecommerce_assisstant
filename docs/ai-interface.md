# Hợp đồng giao diện trợ lý và lớp AI

Tài liệu này mô tả lớp AI hiện có và hợp đồng giữa máy chủ, agent và giao diện. Chat lưu DB, SSE và công cụ đọc/đề xuất ghi sổ đã có; hạn mức trong bộ nhớ và lớp bảo vệ là bản tạm; chế độ luật đã có cho các câu hỏi đọc dữ liệu. Kiểu JSON là nguồn chuẩn tại `client/src/lib/ai/types.ts`; cách gọi nằm ở `client/src/lib/ai/http.ts`. Backend tuân thủ `routes → controllers → services → db` theo [ARCHITECTURE.md](ARCHITECTURE.md).

## Lớp AI hiện có

Nhập các hàm từ `server/src/services/ai/index.js`:

- `chat({ role, messages, tools, toolChoice, responseFormat, temperature, maxTokens, ctx, signal })` trả Promise `{ message, finishReason, model, usage: { promptTokens, completionTokens } }`. `role` là `agent | bot | classify | vision | fraud`; `messages` và `tools` theo định dạng OpenAI. Khi dịch vụ AI không khả dụng, hàm ném lỗi có `code: 'AI_UNAVAILABLE'`; hủy qua `signal` không nhất thiết là lỗi này. `ctx.shopId` phục vụ ghi nhận usage.
- `runToolLoop({ role, messages, tools, maxRounds, ctx, signal })` trả Promise `{ text, messages, toolCalls, rounds, stopReason }`, với `stopReason` là `answer | max_rounds`. Sau khi đạt giới hạn, vòng lặp yêu cầu một câu trả lời cuối không gọi công cụ.
- `loadPrompt(name, vars)` nạp prompt được phép và thay các placeholder bằng giá trị tin cậy; `wrapUntrusted(content, tag)` bọc dữ liệu ngoài, vô hiệu hóa thẻ trùng và không đưa dữ liệu này vào system prompt.
- `isAiUnavailable(err)` nhận diện mã lỗi; `aiStatus()` trả `mock | live | rules` theo cấu hình. `rules` nghĩa là chưa cấu hình nhà cung cấp; khi đó agent trả lời các câu hỏi đọc dữ liệu bằng `classifyByRules`.

Vòng lặp hiện xác thực đối số bằng Zod rồi trực tiếp gọi `tool.run(input, ctx)`. Nó **chưa tự thực thi** phân cấp quyền, bước duyệt hay guardrail; agent và các công cụ phải bảo đảm các điều kiện đó khi triển khai.

### Các hàm cần bổ sung, chưa có người nhận

- `reserveAgentRun(shopId)` giới hạn số yêu cầu `messages` được chấp nhận cho từng cửa hàng theo ngày Việt Nam; sao kê cũng tính một lượt. Trả `429 AI_DAILY_LIMIT` khi hết. Bộ đếm trong bộ nhớ từng tiến trình, đặt lại sau khởi động; cần bộ đếm bền vững cho sản xuất. Duyệt, trả lời câu hỏi và hoàn tác không tính lượt.
- `classifyByRules(text, now?)` (`services/assistant/fallback.js`) trả `{ tool, input }` hoặc `null`, chỉ chọn công cụ đọc: `get_summary`, `list_ledger`, `list_orders`, `get_order`. Khớp từ khóa có dấu và không dấu, hiểu kỳ "hôm nay, hôm qua, tuần này, tuần trước, tháng này, tháng trước, năm nay, N ngày qua" (mặc định tháng này, giờ Việt Nam, tuần bắt đầu thứ Hai). Yêu cầu ghi, sửa, xóa trả `null`. Khi gặp `AI_UNAVAILABLE`, agent chạy công cụ khớp và ghi chú đang ở chế độ cơ bản; lỗi 4xx của công cụ (ví dụ mã đơn không tồn tại) trả thành câu trả lời; không khớp thì trả hướng dẫn các câu hỏi dùng được.

### Các service dự kiến do Viên cung cấp

Chữ ký dưới đây là hợp đồng dự kiến để Viên xác nhận, chưa khẳng định đã có mã:

| Service | Chữ ký và kết quả |
|---|---|
| Sao kê | `parseStatementCsv(buffer)` → `{ rows: [{ index, date, description, amount, reference }], warnings }`; CSV UTF-8, tiền là số nguyên có dấu, dòng không đọc được phải cảnh báo. |
| Phân loại | `classifyRows(rows, ctx)` → kết quả cho từng dòng `{ index, kind, category, confidence, question }`; tối đa 50 dòng mỗi lô, không trả hay sửa số tiền. `kind`: `BUSINESS_REVENUE`, `PERSONAL`, `EXPENSE`, `TRANSFER`; `category`: `SALES`, `SHIPPING`, `ADS`, `INVENTORY`, `OTHER`. |
| Rủi ro | `assessFraud({ events, facts }, ctx)` → `{ level, reasons, signals }`; AI chỉ giữ hoặc nâng mức so với luật, không tạo cảnh báo hay đổi đơn. |
| Ảnh chứng từ | `readReceipt({ buffer, mime }, ctx)` → `{ transactions, warnings }`; JPEG/PNG tối đa 2 MB, không dùng để xác nhận thanh toán. Nhận ảnh ở endpoint upload cần thống nhất riêng. |
| Cửa hàng | `getShopSettings(shopId, { client? }?)` → `{ name, bankCode, bankAccountNumber, bankAccountName }`; `updateShopSettings(shopId, patch, { client? }?)` → `{ before, after }`, mỗi ảnh chụp cùng kiểu cài đặt. Cả hai thuộc `services/shop/shop.service.js`; xem hợp đồng bên dưới. |

Service cửa hàng được agent và trang Cài đặt dùng chung. `shopId` do máy chủ lấy từ phiên đăng nhập; `patch` chỉ nhận các trường cài đặt nêu trên, không nhận token. Các trường ngân hàng có thể `null`; mã ngân hàng gồm 2–20 chữ/số, số tài khoản gồm 5–32 chữ số, tên cửa hàng không rỗng. Dữ liệu sai trả `400 BAD_REQUEST`, cửa hàng không tồn tại trả `404 SHOP_NOT_FOUND`. Hàm cập nhật khóa dòng và trả ảnh chụp trước/sau để bên gọi lưu nhật ký hoàn tác; nếu truyền `client`, bên gọi phải mở transaction và ghi nhật ký trong cùng transaction. Không truyền `client` thì service tự mở transaction. Service không tự duyệt: agent chỉ được gọi hàm cập nhật sau khi người dùng duyệt. Không có endpoint hay công cụ agent nào được tạo bởi service này.

## Agent và công cụ (dự kiến)

Công cụ có dạng `{ name, description, schema, run(input, ctx) }`, trong đó `schema` là Zod object. Danh mục agent gắn thêm cấp `read`, `write` hoặc `sensitive`. `ctx` gồm `{ shopId, userId, runId }`, do máy chủ tạo từ phiên xác thực và lượt xử lý; không cho mô hình chọn hay sửa. Cấp `read` chỉ đọc; `write` đề xuất thay đổi; `sensitive` đề xuất thay đổi nhạy cảm và hiển thị giá trị cũ/mới.

`run()` của `write` và `sensitive` chỉ ghi đề xuất vào bước chờ, trả `{ pending: true }` và không thay đổi dữ liệu nghiệp vụ. Gom mọi đề xuất ghi của một lệnh vào **một** `agentStep`. Khi duyệt, kiểm tra lại quyền sở hữu và điều kiện hiện tại, thực hiện tất cả trong một giao dịch DB, đồng thời lưu nhật ký hành động và ảnh chụp cần cho hoàn tác. Chỉ duyệt bước `waiting`, chỉ hoàn tác bước `done`; thao tác lặp hoặc trạng thái xung đột trả `409 STEP_CONFLICT`, không ghi trùng. Duyệt, trả lời câu hỏi và hoàn tác không gọi mô hình.

Máy chủ dựng số liệu `resultCard` và câu trả về khi duyệt từ kết quả công cụ, không trích từ văn bản mô hình. Không công cụ nào trực tiếp hoặc gián tiếp đưa đơn sang `PAID`; không có công cụ gán giao dịch vào đơn. Các hành động an toàn trên cảnh báo không đổi trạng thái thanh toán.

`shopId` chỉ lấy từ phiên đã xác thực. Mọi bước, tệp, cảnh báo và thông báo phải được kiểm tra thuộc cửa hàng đó; tài nguyên của cửa hàng khác trả `404`. Không tin ID cửa hàng do mô hình hoặc client cung cấp.

`get_activity({from,to})` đếm và cộng khoản thu, khoản chi và đơn tạo trong kỳ theo cửa hàng, tách trạng thái đơn; giao dịch ngân hàng chưa gắn đơn chưa được tính. `export_ledger_book({code?,from?,to?})` chuẩn bị khối `ledgerExport` với mã, tên, kỳ và cảnh báo; mặc định S1a-HKD trong tháng hiện tại theo giờ Việt Nam. Việc tải gọi API sổ thật khi tài chính thật được bật. Số lượng trong `resultCard` có `unit: 'count'`, không hiển thị như tiền.

`query_data` chỉ đọc các thực thể `ledger`, `orders`, `order_items`, `products`, `customers`, `payments`, `files`, `imports`, `alerts`, `conversations`, `messages`, `todos`. Danh sách trường của từng thực thể nằm trong `query-entities.js`; các trường không có trong danh sách bị từ chối. Đầu vào gồm `fields`, `filters` (`eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `contains`), tối đa hai `groupBy` (ngày/tuần/tháng theo giờ Việt Nam), `metrics` (`count`, `sum`, `avg`, `min`, `max`), `sort` và `limit` tối đa 100. `avg` làm tròn tới đơn vị gần nhất. SQL được dựng từ biểu thức cố định và tham số, chạy trong transaction chỉ đọc với `statement_timeout` 3 giây. `order_items` và `messages` kiểm tra cửa hàng qua đơn hoặc hội thoại cha; `payments` chỉ trả dòng có `shop_id` thuộc phiên. Điện thoại chỉ để lộ bốn số cuối, địa chỉ được ẩn; các trường này không được lọc hoặc nhóm. Nội dung tin khách, mô tả giao dịch và tên tệp đi qua `guardData`; do lớp này còn tạm, nội dung tự do được ẩn khỏi mô hình và chỉ hiển thị cho chủ cửa hàng sau khi che các mẫu thông tin nhạy cảm thông dụng. Che nội dung tự do theo mẫu không bảo đảm nhận diện mọi bí mật và địa chỉ; cần guardrail đầy đủ trước khi sử dụng dữ liệu thực nhạy cảm. Kết quả dạng `dataTable` do máy chủ dựng, có nguồn và cách tính; không dùng để suy ra lợi nhuận hay nghĩa vụ thuế.

## Lớp bảo vệ NV-00 (dự kiến, Viên cung cấp)

Hợp đồng dự kiến tại `server/src/services/guardrail/guardrail.service.js`:

- `checkInput({ text, channel, ctx })` → `{ action: 'allow' | 'refuse', category, message, signals }`; `category` là `ok | injection | off_topic | secret_request | forbidden_action`.
- `guardData(content, { source, channel, ctx })` → `{ content, flagged, signals }`; `source` là `statement | receipt | customer_message | tool_output`.
- `assertToolAllowed(tool, { channel })` ném `HttpError(403, 'TOOL_NOT_ALLOWED', message)` nếu công cụ không được phép trên kênh.
- `checkOutput({ text, channel, ctx })` → `{ text, redacted, signals }`.

Thứ tự một lượt: (1) `checkInput`; nếu `refuse`, trả `message` thành khối `text` và không gọi mô hình; yêu cầu được chấp nhận vẫn tính hạn mức tạm; (2) nếu `allow`, agent xử lý sau khi hạn mức đã được kiểm tra tại điểm nhận yêu cầu; (3) trước mỗi công cụ gọi `assertToolAllowed`, dữ liệu ngoài qua `guardData`; nội dung tệp và tin khách còn phải qua `wrapUntrusted` và không đặt trong system prompt; (4) chạy `checkOutput` trước khi lưu văn bản trả lời và phát sự kiện. Agent vẫn chịu trách nhiệm cưỡng chế cấp công cụ và bước duyệt, không dựa riêng vào guardrail.

## HTTP (dự kiến)

Tất cả endpoint dưới đây yêu cầu `Authorization: Bearer <JWT>`. Lỗi theo dạng `{ "error": { "code": "...", "message": "..." } }`. `GET /stream`, `POST /messages`, upload CSV và các endpoint `steps`, cảnh báo, thông báo đã triển khai. Công cụ ghi chỉ tạo đề xuất, việc duyệt và hoàn tác chạy trong giao dịch DB. Các kiểu `Attachment`, `Message`, `Thread`, `Snapshot` và `Block` lấy chính xác từ `types.ts`.

| Phương thức và đường dẫn | Yêu cầu | Thành công |
|---|---|---|
| `GET /api/assistant/stream` | Không body | `text/event-stream` |
| `POST /api/assistant/files` | multipart, trường `file` | `{ fileId, name }` (`Attachment`) |
| `POST /api/assistant/messages` | `{ conversationId, text, attachments: Attachment[] }` | `204`, xử lý bất đồng bộ |
| `POST /api/assistant/steps/:id/answers` | `{ questionId, option }` | `204` |
| `POST /api/assistant/steps/:id/approve` | `{ password? }`; bắt buộc với tài khoản nhận tiền | `{ message }`, thông báo kết quả đã ghi |
| `POST /api/assistant/steps/:id/undo` | `{ password? }`; bắt buộc với tài khoản nhận tiền | `204` |
| `GET /api/assistant/steps/:id/sensitive` | Chỉ bước tài khoản đang chờ duyệt | Tài khoản cũ và mới; `Cache-Control: no-store` |
| `GET /api/assistant/message-recipients` | Không body | Hội thoại thuộc cửa hàng để chủ shop chọn |
| `POST /api/assistant/steps/:id/message-draft` | `{ text, conversationId }` | `204`, lưu bản nháp đã sửa |
| `POST /api/assistant/alerts/:id/safe-action` | Không body | `204` |
| `POST /api/assistant/notices/:id/dismiss` | Không body | `204` |

`conversationId` của chat trung tâm là `hub`; ID khác là luồng việc. Tin người dùng có `{ id, role: 'user', text, files? }`, tin trợ lý có `{ id, role: 'assistant', blocks }`. Khối gồm `text`, `agentStep`, `resultCard`, `dataTable`, `ledgerExport`, `riskAlert`, `threadSummary`, `proactiveNotice`; trường và trạng thái theo `types.ts`, không thay bằng mô tả tự do. Tiền là số nguyên VND từ máy chủ; bảng và thẻ có nguồn và thời điểm cập nhật.

## SSE (dự kiến)

Mỗi lần kết nối, sự kiện đầu tiên là `snapshot` đầy đủ cho cửa hàng đang đăng nhập. Các sự kiện có tên dưới đây, mỗi khung kết thúc bằng một dòng trống. `data` không có trường `type` ở cấp gốc: client lấy tên từ `event` và ghép vào đối tượng. Trường `type` bên trong `blocks` vẫn là một phần của `Block`.

```text
event: snapshot
data: {"snapshot":{"shopName":"Cửa hàng","threads":[],"conversations":{"hub":[]},"typing":[]}}

event: message
data: {"conversationId":"hub","message":{"id":"m1","role":"assistant","blocks":[{"type":"text","text":"Xin chào."}]}}

event: thread
data: {"thread":{"id":"t1","title":"Kiểm tra đơn","status":"waiting","updatedAt":"21:40","scope":"Kiểm tra đơn"}}

event: typing
data: {"conversationId":"hub","value":true}

: ping

```

Gửi chú thích `: ping` mỗi 20 giây. `message` thêm tin mới hoặc thay tin cùng ID; `thread` thêm hoặc thay luồng cùng ID. Khi kết nối lại phải gửi snapshot đầu tiên để đồng bộ; không gửi sự kiện của cửa hàng khác. `updatedAt` của `Thread` là chuỗi hiển thị như `21:40` theo kiểu client, không giả định là ISO.

### Điểm nối cảnh báo

`createAlert(shopId, { eventKey, level, title, reasons, orderId? }, { client } = {})` trong `services/alerts/alerts.service.js` tạo hoặc tìm lại cảnh báo theo cặp cửa hàng và sự việc; `level` là `mid` hoặc `high`. Kết quả `{ alert, created, events }`. Khi truyền `client` đã trong transaction, bên gọi chỉ được gọi `publishAlert(shopId, events)` sau khi commit; không truyền `client` thì service tự giao dịch và phát sự kiện sau commit. Các cảnh báo cùng `eventKey` trong một cửa hàng không tạo thêm luồng hoặc thông báo. Hàm không phát hiện gian lận và không thay đổi đơn hàng.


`propose_change` nhận tối đa 20 thao tác trong `changes`; mỗi thao tác gồm thực thể, hành động, dữ liệu cho phép và mã đối tượng khi sửa hoặc xóa. Máy chủ xác định cửa hàng từ phiên. Đơn chỉ chuyển theo các trạng thái hợp lệ; không có thao tác xác nhận thanh toán. Mọi thay đổi được duyệt trong một giao dịch và có thể hoàn tác nếu dữ liệu chưa đổi tiếp. Đề xuất và nhật ký cũ vẫn được hỗ trợ.

Sản phẩm, khách hàng, việc cần làm và chế độ AI hội thoại cũng có thể được đề xuất thay đổi. Xóa sản phẩm được chuyển thành ngừng bán. Đơn mới chỉ ở trạng thái chờ thanh toán, giá lấy từ sản phẩm của cửa hàng, không trừ tồn kho; nếu giá thay đổi trước khi duyệt, đề xuất bị từ chối. Nhật ký hoàn tác các dữ liệu này được mã hóa; khóa lấy từ `APP_ENCRYPTION_KEY`, hoặc `JWT_SECRET` nếu chưa đặt. Cần giữ khóa ổn định để các thay đổi trước đó còn hoàn tác được.

Đổi tài khoản nhận tiền mặc định tắt (`ASSISTANT_SENSITIVE_ENABLED=false`) cho tới khi kiểm thử tổng. Các trường phải có nguyên văn trong tin của chủ cửa hàng; duyệt và hoàn tác yêu cầu nhập lại mật khẩu. Giới hạn thử mật khẩu tạm nằm trong bộ nhớ một tiến trình. Nội dung tin nhắn gửi khách do chủ shop sửa và chọn người nhận; đầu nối `sendCustomerMessage(shopId, conversationId, text)` chưa gửi thật, trả trạng thái chưa kết nối. Chỉ nối gửi thật sau khi có cơ chế gửi bền vững, chống gửi trùng và kiểm thử tổng. Để tránh lưu số tài khoản, lịch sử chat che mọi chuỗi 5–32 chữ số liền nhau; bản nháp tin khách hiện cũng từ chối các chuỗi đó.
