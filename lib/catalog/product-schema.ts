import { z } from 'zod'

/**
 * Kiểm tra dữ liệu hàng hoá.
 *
 * Dùng union phân biệt theo `kind` thay vì một schema chung với mọi trường
 * optional. Lý do: mỗi loại có bộ trường bắt buộc riêng, và union cho phép
 * TypeScript lẫn thông báo lỗi đều bám đúng loại đang nhập — người dùng chọn
 * "Dịch vụ" thì được nhắc thiếu thời lượng, chứ không nhận một danh sách lỗi
 * lẫn cả trường của thẻ tài khoản.
 *
 * Những luật ở đây trùng với ràng buộc CHECK trong cơ sở dữ liệu
 * (`drizzle/0003_catalog.sql`). Trùng lặp là cố ý: tầng này cho thông báo tiếng
 * Việt dễ hiểu ngay khi gõ, tầng kia là lưới an toàn cuối cùng cho mọi đường
 * ghi dữ liệu, kể cả nhập từ tệp hay chỉnh tay.
 */

/*
 * Hai điều FormData luôn làm mà schema phải lường trước:
 *
 * 1. Ô để trống gửi lên chuỗi rỗng, không phải `undefined`. Nếu để
 *    `z.coerce.number()` nuốt chuỗi rỗng thì `Number('')` ra 0 — "chưa khai tồn
 *    tối thiểu" bị ghi thành 0, và "chưa nhập hạn dùng" báo lỗi tiếng Anh mặc
 *    định của zod thay vì câu nhắc của mình. Nên phải tách chuỗi rỗng ra trước.
 *
 * 2. Ô không được vẽ ra thì không có mặt trong FormData. Form ẩn ô "Thương
 *    hiệu" với dịch vụ/gói/thẻ, nên `brandId` là `undefined` chứ không phải ''.
 *    Mọi trường không bắt buộc vì thế đều phải `.optional()` ở cuối chuỗi.
 */

// Người Việt gõ tiền có dấu chấm ngăn nghìn: "1.500.000"
const parseMoney = (v: string) => Number(v.replace(/[.\s,]/g, ''))

/*
 * Chỉ nhận số thuần ("3500000") hoặc dạng có dấu chấm ngăn nghìn ("3.500.000").
 * Cố ý *không* nhận phần thập phân, dù trông có vẻ khắt khe: kiểu numeric của
 * Postgres trả về "500000.00", và nếu để chuỗi đó lọt xuống `parseMoney` thì
 * việc gỡ dấu chấm biến nửa triệu thành 50 triệu — sai gấp trăm lần, âm thầm,
 * trên đúng thứ dữ liệu không được phép sai. Chặn ở đây để lỗi hiện ra ngay
 * thay vì nằm im trong bảng giá.
 */
const MONEY_RE = /^\d+(\.\d{3})*$/

const money = z
  .string('Chưa nhập số tiền')
  .trim()
  .refine((v) => v !== '', 'Chưa nhập số tiền')
  .refine((v) => MONEY_RE.test(v), 'Số tiền không hợp lệ')
  .transform(parseMoney)
  .refine((n) => Number.isFinite(n), 'Số tiền không hợp lệ')
  .refine((n) => n >= 0, 'Số tiền không được âm')

const optionalMoney = z
  .string()
  .trim()
  .refine((v) => v === '' || MONEY_RE.test(v), 'Số tiền không hợp lệ')
  .transform((v) => (v === '' ? undefined : parseMoney(v)))
  .refine((n) => n === undefined || Number.isFinite(n), 'Số tiền không hợp lệ')
  .refine((n) => n === undefined || n >= 0, 'Số tiền không được âm')
  .optional()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const optionalId = z
  .string()
  .trim()
  .transform((v) => (v === '' ? undefined : v))
  .refine((v) => v === undefined || UUID_RE.test(v), 'Giá trị không hợp lệ')
  .optional()

/** Ô số để trống là "chưa khai", không phải số 0. */
const optionalCount = (message: string, { min = 0, integer = false } = {}) =>
  z
    .string()
    .trim()
    .transform((v) => (v === '' ? undefined : Number(v)))
    .refine(
      (n) =>
        n === undefined || (Number.isFinite(n) && n >= min && (!integer || Number.isInteger(n))),
      message,
    )
    .optional()

const baseFields = {
  name: z.string().trim().min(2, 'Tên hàng phải có ít nhất 2 ký tự').max(255),
  code: z
    .string()
    .trim()
    .max(32, 'Mã hàng tối đa 32 ký tự')
    .regex(/^[A-Za-z0-9_-]*$/, 'Mã hàng chỉ gồm chữ, số, gạch ngang và gạch dưới')
    .optional(),
  categoryId: optionalId,
  brandId: optionalId,
  unitId: optionalId,
  basePrice: money,
  description: z.string().trim().max(2000).optional(),
  isActive: z.coerce.boolean().default(true),
  allowsSale: z.coerce.boolean().default(true),
}

const validity = {
  validityType: z.enum(['days', 'months', 'fixed_date', 'unlimited']).default('unlimited'),
  validityValue: optionalCount('Hạn dùng phải là số nguyên lớn hơn 0', { min: 1, integer: true }),
}

/** Gói phải có ít nhất một dịch vụ; mỗi dòng cần số buổi và giá lẻ. */
const packageComponent = z.object({
  serviceId: z.uuid('Chưa chọn dịch vụ'),
  sessions: z.coerce.number().int('Số buổi phải là số nguyên').min(1, 'Số buổi phải từ 1 trở lên'),
  bonusSessions: z.coerce
    .number()
    .int('Số buổi tặng phải là số nguyên')
    .min(0, 'Số buổi tặng không được âm')
    .default(0),
  retailPrice: money,
})

/** Định mức: mỗi dòng là một sản phẩm và lượng tiêu hao cho một buổi. */
const materialLine = z.object({
  materialId: z.uuid('Chưa chọn nguyên vật liệu'),
  quantity: z.coerce.number().positive('Định mức phải lớn hơn 0'),
})

export const productSchema = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('product'),
      ...baseFields,
      cost: optionalMoney,
      trackInventory: z.coerce.boolean().default(true),
      minQuantity: optionalCount('Tồn tối thiểu phải là số không âm'),
      maxQuantity: optionalCount('Tồn tối đa phải là số không âm'),
    }),

    z.object({
      kind: z.literal('service'),
      ...baseFields,
      cost: optionalMoney,
      durationMinutes: z.coerce
        .number('Thời lượng phải là số')
        .int('Thời lượng phải là số nguyên phút')
        .min(5, 'Thời lượng tối thiểu 5 phút')
        .max(600, 'Thời lượng tối đa 10 tiếng'),
      materials: z.array(materialLine).default([]),
    }),

    z.object({
      kind: z.literal('package'),
      ...baseFields,
      ...validity,
      components: z.array(packageComponent).min(1, 'Gói phải có ít nhất một dịch vụ'),
    }),

    z.object({
      kind: z.literal('card'),
      ...baseFields,
      ...validity,
      cardFaceValue: money,
      cardBonusValue: optionalMoney,
    }),
  ])
  .superRefine((data, ctx) => {
    // Hạn dùng theo ngày/tháng thì bắt buộc có số
    if ('validityType' in data) {
      const needsValue = data.validityType === 'days' || data.validityType === 'months'
      if (needsValue && !data.validityValue) {
        ctx.addIssue({
          code: 'custom',
          path: ['validityValue'],
          message: 'Chọn hạn dùng theo ngày/tháng thì phải nhập số',
        })
      }
    }

    // Tồn tối đa phải lớn hơn tồn tối thiểu
    if (data.kind === 'product' && data.minQuantity != null && data.maxQuantity != null) {
      if (data.maxQuantity < data.minQuantity) {
        ctx.addIssue({
          code: 'custom',
          path: ['maxQuantity'],
          message: 'Tồn tối đa phải lớn hơn tồn tối thiểu',
        })
      }
    }

    // Một dịch vụ chỉ được xuất hiện một lần trong gói
    if (data.kind === 'package') {
      const seen = new Set<string>()
      data.components.forEach((c, i) => {
        if (seen.has(c.serviceId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['components', i, 'serviceId'],
            message: 'Dịch vụ này đã có trong gói',
          })
        }
        seen.add(c.serviceId)
      })
    }

    // Tương tự với định mức nguyên vật liệu
    if (data.kind === 'service') {
      const seen = new Set<string>()
      data.materials.forEach((m, i) => {
        if (seen.has(m.materialId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['materials', i, 'materialId'],
            message: 'Nguyên vật liệu này đã có trong định mức',
          })
        }
        seen.add(m.materialId)
      })
    }
  })

export type ProductInput = z.infer<typeof productSchema>

/** Tiền tố mã hàng theo loại — khớp thói quen của KiotViet để dễ đối chiếu. */
export const CODE_PREFIX: Record<ProductInput['kind'], string> = {
  product: 'SP',
  service: 'DV',
  package: 'GOI',
  card: 'THE',
}
