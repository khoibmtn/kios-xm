import { z } from 'zod'

/**
 * Kiểm tra dữ liệu hồ sơ nhân viên.
 *
 * Cùng hai điều đã làm hỏng form hàng hoá và phải nhớ ở đây: ô để trống gửi
 * lên **chuỗi rỗng**, ô không được vẽ ra thì **vắng mặt hẳn**. Vì vậy mọi
 * trường không bắt buộc đều kết thúc bằng `.optional()`, và chuỗi rỗng được
 * quy về `undefined` trước khi kiểm tra — nếu không, "chưa nhập email" sẽ báo
 * lỗi "email không hợp lệ", còn "chưa chọn phòng ban" thì chặn cả lần lưu.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Chuỗi rỗng ⇒ chưa khai. Trả `undefined` để tầng ghi biết mà đặt NULL. */
const blankToUndefined = z
  .string()
  .trim()
  .transform((v) => (v === '' ? undefined : v))

const optionalText = (max: number, message?: string) =>
  blankToUndefined
    .refine((v) => v === undefined || v.length <= max, message ?? `Tối đa ${max} ký tự`)
    .optional()

const optionalId = blankToUndefined
  .refine((v) => v === undefined || UUID_RE.test(v), 'Giá trị không hợp lệ')
  .optional()

const optionalDate = blankToUndefined
  .refine((v) => v === undefined || DATE_RE.test(v), 'Ngày không hợp lệ')
  .optional()

/*
 * Số điện thoại Việt Nam: người dùng gõ kèm dấu cách, dấu chấm hay +84 tuỳ
 * thói quen. Chuẩn hoá về chuỗi số để tìm kiếm và chống trùng còn hoạt động,
 * nhưng không ép định dạng quá chặt — spa vẫn có khách và nhân viên dùng số cũ
 * 10 số lẫn số nước ngoài.
 */
const optionalPhone = blankToUndefined
  .transform((v) => (v === undefined ? undefined : v.replace(/[\s.\-()]/g, '')))
  .refine((v) => v === undefined || /^\+?\d{8,15}$/.test(v), 'Số điện thoại không hợp lệ')
  .optional()

const optionalEmail = blankToUndefined
  .refine((v) => v === undefined || z.email().safeParse(v).success, 'Email không hợp lệ')
  .optional()

/**
 * `z.enum([...]).optional()` không cứu được ô chọn để trống: giá trị gửi lên là
 * chuỗi rỗng, không phải `undefined`, nên zod báo "giá trị không thuộc danh
 * sách" cho một ô người dùng cố tình bỏ trống.
 */
const optionalEnum = <const T extends readonly [string, ...string[]]>(values: T, message: string) =>
  blankToUndefined
    .refine((v) => v === undefined || (values as readonly string[]).includes(v), message)
    .transform((v) => v as T[number] | undefined)
    .optional()

export const employeeSchema = z
  .object({
    fullName: z.string('Chưa nhập tên').trim().min(2, 'Tên phải có ít nhất 2 ký tự').max(255),
    code: blankToUndefined
      .refine(
        (v) => v === undefined || /^[A-Za-z0-9_-]{1,32}$/.test(v),
        'Mã chỉ gồm chữ, số, gạch ngang và gạch dưới, tối đa 32 ký tự',
      )
      .optional(),
    clockCode: optionalText(32),

    phone: optionalPhone,
    email: optionalEmail,
    gender: optionalEnum(['male', 'female', 'other'], 'Giới tính không hợp lệ'),
    birthday: optionalDate,
    idNumber: optionalText(32, 'Số CMND/CCCD tối đa 32 ký tự'),
    address: optionalText(500),

    departmentId: optionalId,
    positionId: optionalId,
    workBranchId: optionalId,
    payBranchId: optionalId,

    hiredAt: optionalDate,
    leftAt: optionalDate,
    status: z.enum(['working', 'left']).default('working'),

    bankAccount: optionalText(64),
    bankName: optionalText(255),
    note: optionalText(2000),
  })
  .superRefine((data, ctx) => {
    // Đã nghỉ thì phải biết nghỉ từ bao giờ — thiếu ngày là hồ sơ treo,
    // báo cáo nhân sự và bảng lương đều không chốt được.
    if (data.status === 'left' && !data.leftAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['leftAt'],
        message: 'Đánh dấu đã nghỉ thì phải nhập ngày nghỉ',
      })
    }

    if (data.status === 'working' && data.leftAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['leftAt'],
        message: 'Đang làm việc thì bỏ trống ngày nghỉ',
      })
    }

    if (data.hiredAt && data.leftAt && data.leftAt < data.hiredAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['leftAt'],
        message: 'Ngày nghỉ phải sau ngày vào làm',
      })
    }

    if (data.birthday && data.birthday >= new Date().toISOString().slice(0, 10)) {
      ctx.addIssue({ code: 'custom', path: ['birthday'], message: 'Ngày sinh phải ở quá khứ' })
    }
  })

export type EmployeeInput = z.infer<typeof employeeSchema>

/** Tên phòng ban / chức danh khi tạo nhanh ngay trong form nhân viên. */
export const orgUnitSchema = z.object({
  kind: z.enum(['department', 'position']),
  name: z.string('Chưa nhập tên').trim().min(2, 'Tên phải có ít nhất 2 ký tự').max(100),
})
