// Prep for F5.3 / F5.4. Every case is marked `todo`: the reconciliation service lands on
// 28/11. Running this file must never fail — it is the checklist the implementation fills in.
// Rules and open questions: docs/payment-reconcile.md
import { test } from 'node:test'

test('đủ tiền: AWAITING_PAYMENT → PAID, ghi ledger INCOME, trừ tồn kho', { todo: 'F5.3' }, () => {})

test('thiếu tiền: giữ AWAITING_PAYMENT, match_status UNDERPAID, tạo Việc cần làm', { todo: 'F5.3' }, () => {})

test('dư tiền: không tự đánh dấu PAID khi chưa có quyết định của chủ shop', { todo: 'F5.3' }, () => {})

test('đơn đã hết hạn (expires_at < now): không tự duyệt, tạo Việc cần làm', { todo: 'F5.3' }, () => {})

test('cùng một sepay_id gửi hai lần: chỉ một lần đối soát, đơn không đổi trạng thái lần hai', { todo: 'F5.4' }, () => {})

test('sai payment_code: match_status NO_ORDER, không đụng đơn nào', { todo: 'F5.4' }, () => {})

test('giao dịch tiền ra (transferType = out): bỏ qua hoàn toàn', { todo: 'F5.4' }, () => {})
