// Every error code the API returns, with its HTTP status and a default Vietnamese message.
// A code always has the same status. Add a new code here before throwing it.
// See docs/ARCHITECTURE.md, section "Errors".

export const ERROR_CODES = Object.freeze({
  // 400: the request itself is wrong
  BAD_REQUEST: { status: 400, message: 'Yêu cầu không hợp lệ.' },
  INVALID_JSON: { status: 400, message: 'Nội dung gửi lên không phải JSON hợp lệ.' },
  INVALID_INPUT: { status: 400, message: 'Dữ liệu gửi lên không hợp lệ.' },
  INVALID_FILE: { status: 400, message: 'Tệp không hợp lệ.' }, // 413 when the file is too large
  INVALID_STATEMENT: { status: 400, message: 'Tệp sao kê không hợp lệ.' },

  // 401 / 403: who is asking
  UNAUTHORIZED: { status: 401, message: 'Vui lòng đăng nhập lại.' },
  INVALID_CREDENTIALS: { status: 401, message: 'Email hoặc mật khẩu không đúng.' },
  FORBIDDEN: { status: 403, message: 'Bạn không có quyền thực hiện thao tác này.' },
  TOOL_NOT_ALLOWED: { status: 403, message: 'Công cụ không được phép.' },

  // 404: the thing does not exist (or belongs to another shop)
  NOT_FOUND: { status: 404, message: 'Không tìm thấy.' },
  SHOP_NOT_FOUND: { status: 404, message: 'Không tìm thấy cửa hàng.' },
  ORDER_NOT_FOUND: { status: 404, message: 'Không tìm thấy đơn hàng.' },
  ENTRY_NOT_FOUND: { status: 404, message: 'Không tìm thấy khoản thu chi.' },
  FILE_NOT_FOUND: { status: 404, message: 'Không tìm thấy tệp.' },
  STEP_NOT_FOUND: { status: 404, message: 'Không tìm thấy bước.' },
  ALERT_NOT_FOUND: { status: 404, message: 'Không tìm thấy cảnh báo.' },

  // 409: the request conflicts with the current state
  CONFLICT: { status: 409, message: 'Dữ liệu đã thay đổi; vui lòng tải lại.' },
  DUPLICATE: { status: 409, message: 'Dữ liệu này đã tồn tại.' },
  INVALID_REFERENCE: { status: 409, message: 'Dữ liệu liên quan không tồn tại hoặc đang được dùng.' },
  DATABASE_BUSY: { status: 409, message: 'Hệ thống đang bận; vui lòng thử lại.' },
  EMAIL_EXISTS: { status: 409, message: 'Email này đã được đăng ký.' },
  STEP_CONFLICT: { status: 409, message: 'Bước đã thay đổi hoặc không thể thực hiện.' },
  CHANGE_CONFLICT: { status: 409, message: 'Dữ liệu đã thay đổi sau lượt chạy; không thể hoàn tác.' },
  ORDER_CONFLICT: { status: 409, message: 'Không thể chuyển trạng thái đơn này.' },
  ENTRY_NOT_MANUAL: { status: 409, message: 'Không thể xóa khoản thu chi tự động.' },
  FINANCE_INCOMPLETE: { status: 409, message: 'Dữ liệu chưa đủ để tính báo cáo.' },
  DUPLICATE_FILE: { status: 409, message: 'Tệp này đã được nhập.' },
  ASSISTANT_BUSY: { status: 409, message: 'Trợ lý đang xử lý yêu cầu trước.' },
  ALREADY_UNDONE: { status: 409, message: 'Lượt chạy đã được hoàn tác.' },
  UNDO_EXPIRED: { status: 409, message: 'Đã quá thời hạn hoàn tác.' },
  ALERT_CLOSED: { status: 409, message: 'Cảnh báo đã được xử lý.' },

  // 413 / 429: too much
  PAYLOAD_TOO_LARGE: { status: 413, message: 'Nội dung gửi lên quá lớn.' },
  TOO_MANY_ATTEMPTS: { status: 429, message: 'Bạn thử quá nhiều lần; vui lòng đợi một lát.' },
  AI_DAILY_LIMIT: { status: 429, message: 'Cửa hàng đã hết lượt trợ lý hôm nay.' },

  // 5xx: our side
  INTERNAL_ERROR: { status: 500, message: 'Lỗi máy chủ; vui lòng thử lại sau.' },
  NOT_IMPLEMENTED: { status: 501, message: 'Chức năng chưa được hỗ trợ.' },
  NOT_CONFIGURED: { status: 503, message: 'Chức năng chưa được cấu hình.' },
  DATABASE_UNAVAILABLE: { status: 503, message: 'Không kết nối được cơ sở dữ liệu; vui lòng thử lại sau.' },
  DATABASE_TIMEOUT: { status: 503, message: 'Truy vấn mất quá nhiều thời gian; vui lòng thử lại.' },
  AI_UNAVAILABLE: { status: 503, message: 'AI tạm thời không khả dụng.' },
  ASSISTANT_UNAVAILABLE: { status: 503, message: 'Trợ lý tạm thời không khả dụng.' },
  DEMO_UNAVAILABLE: { status: 503, message: 'Tài khoản demo chưa sẵn sàng.' },
})
