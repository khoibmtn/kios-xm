import type { Permission } from '@/lib/auth/permissions'

/**
 * Cây menu quản trị, bám theo `docs/research/01-module-map.md` §2.
 *
 * Mục chưa dựng xong vẫn được liệt kê nhưng **không phải là liên kết** — hiện
 * mờ kèm chữ "sắp có". Lý do: nếu chỉ hiện những gì đã làm, chủ spa không biết
 * phần mềm sẽ đi tới đâu và mỗi lần thêm màn hình là một lần menu nhảy chỗ;
 * còn nếu để liên kết chết thì mỗi lần bấm là một trang 404. Hiện đủ hình
 * dạng, nói thật cái nào chưa có.
 *
 * `permission` quyết định mục có xuất hiện hay không: lễ tân không cần thấy
 * nhóm Phân tích hay Sổ quỹ.
 */

export interface NavItem {
  label: string
  /** Bỏ trống nghĩa là chưa dựng — hiện mờ, không bấm được. */
  href?: string
  permission: Permission
  /** Khớp cả đường dẫn con (ví dụ Hàng hoá sáng khi đang ở trang chi tiết). */
  matchPrefix?: boolean
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: '',
    items: [{ label: 'Tổng quan', href: '/admin', permission: 'product.view' }],
  },
  {
    label: 'Hàng hoá',
    items: [
      { label: 'Danh sách hàng hoá', href: '/admin/products', permission: 'product.view', matchPrefix: true },
      { label: 'Nhóm hàng, thương hiệu, đơn vị', href: '/admin/catalog', permission: 'product.manage', matchPrefix: true },
      { label: 'Thiết lập giá', permission: 'product.manage_price' },
      { label: 'Kiểm kho', permission: 'inventory.manage' },
      { label: 'Xuất huỷ, xuất dùng', permission: 'inventory.manage' },
      { label: 'Nhà cung cấp, nhập hàng', permission: 'inventory.manage' },
    ],
  },
  {
    label: 'Lịch hẹn & Bán hàng',
    items: [
      { label: 'Lịch hẹn', permission: 'booking.view_all' },
      { label: 'Vị trí, phòng', href: '/admin/rooms', permission: 'settings.manage', matchPrefix: true },
      { label: 'Hoá đơn', href: '/admin/invoices', permission: 'invoice.view', matchPrefix: true },
      { label: 'Trả hàng', permission: 'invoice.return' },
    ],
  },
  {
    label: 'Khách hàng',
    items: [
      { label: 'Danh sách khách hàng', href: '/admin/customers', permission: 'customer.view', matchPrefix: true },
      { label: 'Gói, thẻ đã bán', href: '/admin/packages', permission: 'package.view', matchPrefix: true },
      { label: 'Voucher, khuyến mại', permission: 'settings.manage' },
    ],
  },
  {
    label: 'Nhân viên',
    items: [
      { label: 'Danh sách nhân viên', href: '/admin/employees', permission: 'employee.view', matchPrefix: true },
      { label: 'Lịch làm việc', permission: 'employee.manage' },
      { label: 'Bảng chấm công', permission: 'employee.manage_payroll' },
      { label: 'Bảng lương', permission: 'employee.manage_payroll' },
      { label: 'Bảng hoa hồng', permission: 'employee.manage_commission' },
    ],
  },
  {
    label: 'Tài chính & Phân tích',
    items: [
      { label: 'Sổ quỹ', permission: 'financial.view_cashbook' },
      { label: 'Báo cáo bán hàng', permission: 'report.view_sales' },
      { label: 'Báo cáo tài chính', permission: 'report.view_financial' },
      { label: 'Báo cáo nhân viên', permission: 'report.view_employee' },
    ],
  },
  {
    label: 'Thiết lập',
    items: [
      { label: 'Cấu hình chung', href: '/admin/settings', permission: 'settings.manage' },
      { label: 'Lưu trữ Google Drive', href: '/admin/settings/storage', permission: 'settings.manage' },
      { label: 'Nhật ký thao tác', href: '/admin/audit', permission: 'settings.view_audit' },
    ],
  },
]
