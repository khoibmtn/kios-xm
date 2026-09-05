/**
 * Bộ quyền chi tiết của kios-xm.
 *
 * Nguyên tắc (ADR-001 §3.5, §3.6):
 *  - Không dùng vài cờ chung chung; mỗi hành động nhạy cảm là một quyền riêng.
 *  - `customer.view` KHÔNG kéo theo quyền xem hồ sơ y tế.
 *  - Lễ tân cần biết khách "có cảnh báo" nhưng không cần đọc chẩn đoán.
 */

export const PERMISSIONS = {
  // ── Tài chính ──────────────────────────────────────────────
  'financial.view_revenue': 'Xem doanh thu',
  'financial.view_cost': 'Xem giá vốn',
  'financial.view_profit': 'Xem lợi nhuận',
  'financial.view_cashbook': 'Xem sổ quỹ',
  'financial.manage_cashbook': 'Lập phiếu thu/chi',
  'financial.close_book': 'Khoá sổ',

  // ── Hàng hoá ───────────────────────────────────────────────
  'product.view': 'Xem hàng hoá',
  'product.manage': 'Thêm/sửa hàng hoá',
  'product.manage_price': 'Thiết lập giá',

  // ── Kho ────────────────────────────────────────────────────
  'inventory.view': 'Xem tồn kho',
  'inventory.manage': 'Nhập hàng, kiểm kho, xuất huỷ/xuất dùng',

  // ── Khách hàng ─────────────────────────────────────────────
  'customer.view': 'Xem khách hàng',
  'customer.manage': 'Thêm/sửa khách hàng',
  'customer.view_debt': 'Xem công nợ khách',

  // ── Hồ sơ y tế — tách tầng, KHÔNG suy ra từ customer.view ──
  /** Chỉ thấy dấu hiệu "⚠ khách có chống chỉ định/dị ứng", không thấy nội dung. */
  'medical.alert_view': 'Xem cảnh báo y tế (không kèm nội dung)',
  'medical.record_view': 'Xem hồ sơ y tế (chẩn đoán, tiền sử)',
  'medical.record_edit': 'Sửa hồ sơ y tế',
  'medical.image_view': 'Xem ảnh điều trị trước/sau',

  // ── Lịch hẹn ───────────────────────────────────────────────
  'booking.view_all': 'Xem toàn bộ lịch hẹn',
  'booking.view_own': 'Xem lịch hẹn của mình',
  'booking.manage': 'Đặt/sửa/huỷ lịch hẹn',

  // ── Bán hàng ───────────────────────────────────────────────
  'invoice.view': 'Xem hoá đơn',
  'invoice.create': 'Lập hoá đơn',
  'invoice.return': 'Trả hàng',
  /** Sửa NV tư vấn / KTV thực hiện trên hoá đơn ĐÃ hoàn tất (G6′). */
  'invoice.change_completed_attribution': 'Sửa người thực hiện/tư vấn sau khi hoàn tất',
  'invoice.override_discount_limit': 'Giảm giá vượt hạn mức',

  // ── Gói dịch vụ & thẻ ──────────────────────────────────────
  'package.view': 'Xem gói/thẻ đã bán',
  'package.sell': 'Bán gói/thẻ',
  'package.override_interval': 'Bỏ qua giãn cách tối thiểu giữa các buổi',
  'package.extend_expiry': 'Gia hạn gói/thẻ',
  'package.adjust_sessions': 'Điều chỉnh/tặng thêm số buổi',

  // ── Nhân sự ────────────────────────────────────────────────
  'employee.view': 'Xem nhân viên',
  'employee.manage': 'Thêm/sửa nhân viên',
  'employee.view_own_income': 'Xem thu nhập của chính mình',
  'employee.view_all_income': 'Xem thu nhập toàn bộ nhân viên',
  'employee.manage_payroll': 'Lập bảng lương',
  'employee.manage_commission': 'Thiết lập bảng hoa hồng',

  // ── Báo cáo ────────────────────────────────────────────────
  'report.view_sales': 'Báo cáo bán hàng',
  'report.view_financial': 'Báo cáo tài chính',
  'report.view_employee': 'Báo cáo nhân viên',

  // ── Hệ thống ───────────────────────────────────────────────
  'settings.manage': 'Thiết lập hệ thống',
  'settings.manage_users': 'Quản lý tài khoản & phân quyền',
  'settings.view_audit': 'Xem nhật ký thao tác',
} as const

export type Permission = keyof typeof PERMISSIONS

/** Vai trò dựng sẵn. Chủ spa có toàn quyền. */
export const SYSTEM_ROLES: Record<string, { name: string; permissions: Permission[] }> = {
  owner: {
    name: 'Chủ spa',
    permissions: Object.keys(PERMISSIONS) as Permission[],
  },

  manager: {
    name: 'Quản lý',
    permissions: [
      'financial.view_revenue', 'financial.view_cost', 'financial.view_profit',
      'financial.view_cashbook', 'financial.manage_cashbook',
      'product.view', 'product.manage', 'product.manage_price',
      'inventory.view', 'inventory.manage',
      'customer.view', 'customer.manage', 'customer.view_debt',
      'medical.alert_view', 'medical.record_view', 'medical.image_view',
      'booking.view_all', 'booking.manage',
      'invoice.view', 'invoice.create', 'invoice.return',
      'invoice.change_completed_attribution', 'invoice.override_discount_limit',
      'package.view', 'package.sell', 'package.extend_expiry', 'package.adjust_sessions',
      'employee.view', 'employee.manage', 'employee.view_all_income',
      'employee.manage_payroll', 'employee.manage_commission',
      'report.view_sales', 'report.view_financial', 'report.view_employee',
      'settings.view_audit',
    ],
  },

  /**
   * Lễ tân: bán hàng, đặt lịch, chăm khách.
   * KHÔNG xem giá vốn / lợi nhuận / lương — không cần cho nghiệp vụ quầy.
   * Thấy được cảnh báo y tế nhưng không mở được chẩn đoán.
   */
  receptionist: {
    name: 'Lễ tân',
    permissions: [
      'product.view',
      'inventory.view',
      'customer.view', 'customer.manage', 'customer.view_debt',
      'medical.alert_view',
      'booking.view_all', 'booking.manage',
      'invoice.view', 'invoice.create',
      'package.view', 'package.sell',
      'employee.view',
      'financial.view_cashbook',
    ],
  },

  /**
   * Kỹ thuật viên: chỉ lịch của mình, khách của mình, thu nhập của mình.
   * KHÔNG xem doanh thu toàn spa.
   */
  technician: {
    name: 'Kỹ thuật viên',
    permissions: [
      'booking.view_own',
      'customer.view',
      'medical.alert_view', 'medical.record_view', 'medical.image_view',
      'employee.view_own_income',
      'product.view',
    ],
  },

  /** Bác sĩ / chuyên viên y khoa: thêm quyền ghi hồ sơ. */
  doctor: {
    name: 'Bác sĩ',
    permissions: [
      'booking.view_own', 'booking.view_all',
      'customer.view', 'customer.manage',
      'medical.alert_view', 'medical.record_view', 'medical.record_edit', 'medical.image_view',
      'employee.view_own_income',
      'product.view',
    ],
  },
}

export function hasPermission(granted: readonly string[], required: Permission): boolean {
  return granted.includes(required)
}

export function hasAnyPermission(granted: readonly string[], required: readonly Permission[]): boolean {
  return required.some((p) => granted.includes(p))
}

export function hasAllPermissions(granted: readonly string[], required: readonly Permission[]): boolean {
  return required.every((p) => granted.includes(p))
}
