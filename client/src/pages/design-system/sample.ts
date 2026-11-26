// Dữ liệu mẫu cho trang /design-system. Không phải dữ liệu thật.
import { BookOpen, ChartLine, Database, MessageCircle, ShieldAlert, ShoppingBag } from 'lucide-react'
import type { FeatureNavItem, ThreadItem } from '@/components/dongtien'

export const FEATURES: FeatureNavItem[] = [
  { id: 'ledger', label: 'Sổ thu chi', icon: BookOpen },
  { id: 'orders', label: 'Đơn hàng', icon: ShoppingBag },
  { id: 'reports', label: 'Báo cáo', icon: ChartLine },
  { id: 'fraud', label: 'Cảnh báo lừa đảo', icon: ShieldAlert },
  { id: 'messenger', label: 'Bot Messenger', icon: MessageCircle },
  { id: 'sources', label: 'Nguồn dữ liệu', icon: Database },
]

export const THREADS: ThreadItem[] = [
  { id: 't-1042', title: 'Kiểm tra đơn #1042', status: 'alert', updatedAt: '21:15' },
  { id: 't-ledger', title: 'Ghi sổ sao kê 26/11', status: 'waiting', updatedAt: '21:40' },
  { id: 't-week', title: 'Báo cáo tuần 47', status: 'running' },
  { id: 't-remind', title: 'Nhắc 3 khách nhận hàng', status: 'done', updatedAt: '20:05' },
]
