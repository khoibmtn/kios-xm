import type { ProductKind } from '@/lib/catalog/labels'

/**
 * Kiểu dữ liệu và giá trị mặc định của form hàng hoá.
 *
 * Tách khỏi `product-form.tsx` là bắt buộc, không phải cho gọn: file kia mở đầu
 * bằng `'use client'`, nên mọi export của nó khi được server component import
 * chỉ còn là *client reference* — một vỏ rỗng để React biết đường gửi sang trình
 * duyệt, chứ không phải giá trị thật. Server component `new/page.tsx` từng
 * `{...EMPTY_FORM}` trên cái vỏ đó và nhận về một object thiếu gần hết trường,
 * làm trang đổ ngay khi render (`components` là undefined). Hằng số dùng chung
 * giữa hai phía phải nằm ở module trung tính như file này.
 */

export interface Option {
  value: string
  label: string
}

export interface ServiceOption extends Option {
  price: string
}

export interface ProductFormData {
  id?: string
  kind: ProductKind
  code: string
  name: string
  categoryId: string
  brandId: string
  unitId: string
  basePrice: string
  cost: string
  description: string
  isActive: boolean
  allowsSale: boolean
  durationMinutes: string
  cardFaceValue: string
  cardBonusValue: string
  validityType: string
  validityValue: string
  trackInventory: boolean
  minQuantity: string
  maxQuantity: string
  components: { serviceId: string; sessions: string; bonusSessions: string; retailPrice: string }[]
  materials: { materialId: string; quantity: string }[]
}

export const EMPTY_FORM: ProductFormData = {
  kind: 'service',
  code: '',
  name: '',
  categoryId: '',
  brandId: '',
  unitId: '',
  basePrice: '',
  cost: '',
  description: '',
  isActive: true,
  allowsSale: true,
  durationMinutes: '60',
  cardFaceValue: '',
  cardBonusValue: '',
  validityType: 'unlimited',
  validityValue: '',
  trackInventory: true,
  minQuantity: '',
  maxQuantity: '',
  components: [],
  materials: [],
}
