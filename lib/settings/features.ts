/**
 * Danh mục cờ tính năng bật/tắt theo từng spa.
 *
 * Chỉ liệt kê những thứ **thật sự tuỳ chọn** — cái mà một spa dùng hằng ngày
 * còn spa khác không bao giờ đụng tới. Những gì mọi spa đều cần thì không nên
 * có cờ: mỗi cờ là một nhánh phải nhớ khi đọc mã, và một cờ không ai tắt chỉ
 * làm mã rối thêm.
 *
 * `appliesFrom` nói thật mốc nào cờ mới có tác dụng, để màn hình thiết lập
 * không hứa suông với chủ spa.
 */

export const FEATURES = {
  medical_records: {
    label: 'Hồ sơ y tế',
    hint: 'Chẩn đoán, tiền sử, chống chỉ định và ảnh trước/sau. Chỉ spa có bác sĩ mới cần.',
    appliesFrom: 'M6',
  },
  commission: {
    label: 'Hoa hồng nhân viên',
    hint: 'Tính hoa hồng theo người thực hiện, người tư vấn và thu ngân.',
    appliesFrom: 'M5',
  },
  loyalty_points: {
    label: 'Tích điểm khách hàng',
    hint: 'Cộng điểm theo hoá đơn và cho phép dùng điểm để thanh toán.',
    appliesFrom: 'M4',
  },
  recurring_bookings: {
    label: 'Lịch hẹn định kỳ',
    hint: 'Đặt trước cả liệu trình theo chu kỳ, ví dụ mỗi tuần một buổi.',
    appliesFrom: 'M2',
  },
} as const

export type FeatureKey = keyof typeof FEATURES

export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[]
