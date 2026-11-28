// Các giao dịch chưa gắn đơn chưa có liên kết cửa hàng đáng tin cậy (Q19).
export async function listUnmatchedPayments() {
  return { available: false, message: 'Chưa hỗ trợ xem giao dịch chưa đối soát. Vui lòng mở trang Giao dịch khi dữ liệu được kết nối.' }
}
