import { BookOpen, ChartLine, Database, MessageCircle, ShieldAlert, ShoppingBag } from 'lucide-react'
import type { FeatureNavItem } from '@/components/flowy'

/** Các trang chức năng trong sidebar. `about` nói trang sẽ có gì khi nối dữ liệu thật. */
export const FEATURES: (FeatureNavItem & { about: string })[] = [
  { id: 'ledger', label: 'Sổ thu chi', icon: BookOpen, about: 'Các khoản thu, chi đã ghi và form nhập khoản chi.' },
  { id: 'orders', label: 'Đơn hàng', icon: ShoppingBag, about: 'Danh sách đơn và trạng thái thanh toán.' },
  { id: 'reports', label: 'Báo cáo', icon: ChartLine, about: 'Doanh thu, chi phí, lãi theo ngày và sản phẩm bán chạy.' },
  { id: 'fraud', label: 'Cảnh báo lừa đảo', icon: ShieldAlert, about: 'Đơn khả nghi và giao dịch cần xử lý.' },
  { id: 'messenger', label: 'Bot Messenger', icon: MessageCircle, about: 'Hội thoại với khách và nút chuyển sang người trả lời.' },
  { id: 'sources', label: 'Nguồn dữ liệu', icon: Database, about: 'Trang Facebook, tài khoản ngân hàng và file sao kê đã nhập.' },
]
