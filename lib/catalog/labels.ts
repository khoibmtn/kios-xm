/** Nhãn tiếng Việt và màu nhận diện cho bốn loại hàng hoá. */

export type ProductKind = 'product' | 'service' | 'package' | 'card'

export const KIND_LABEL: Record<ProductKind, string> = {
  product: 'Sản phẩm',
  service: 'Dịch vụ',
  package: 'Gói dịch vụ',
  card: 'Thẻ tài khoản',
}

/** Khớp với các biến màu khai trong globals.css. */
export const KIND_TONE: Record<ProductKind, 'product' | 'service' | 'package' | 'card'> = {
  product: 'product',
  service: 'service',
  package: 'package',
  card: 'card',
}

export const KIND_ORDER: ProductKind[] = ['service', 'package', 'card', 'product']

export const VALIDITY_LABEL: Record<string, string> = {
  days: 'ngày',
  months: 'tháng',
  fixed_date: 'đến ngày cố định',
  unlimited: 'vô thời hạn',
}

/** "6 tháng" · "90 ngày" · "vô thời hạn" */
export function formatValidity(
  type: string | null | undefined,
  value: number | null | undefined,
): string {
  if (!type || type === 'unlimited') return 'Vô thời hạn'
  if (type === 'fixed_date') return 'Đến ngày cố định'
  return value ? `${value} ${VALIDITY_LABEL[type]}` : '—'
}
