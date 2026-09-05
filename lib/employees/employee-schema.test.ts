import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { employeeSchema } from './employee-schema'

/** Đúng thứ form gửi lên khi người dùng chỉ điền tên. */
const minimal = {
  fullName: 'Nguyễn Thị An',
  code: '',
  clockCode: '',
  phone: '',
  email: '',
  gender: '',
  birthday: '',
  idNumber: '',
  address: '',
  departmentId: '',
  positionId: '',
  workBranchId: '',
  payBranchId: '',
  hiredAt: '',
  status: 'working',
  bankAccount: '',
  bankName: '',
  note: '',
  // `leftAt` vắng mặt hẳn: ô chỉ được vẽ khi trạng thái là "đã nghỉ"
}

function firstError(result: ReturnType<typeof employeeSchema.safeParse>) {
  if (result.success) return null
  const issue = result.error.issues[0]
  return { path: issue.path.map(String).join('.'), message: issue.message }
}

describe('Kiểm tra hồ sơ nhân viên', () => {
  it('chỉ cần tên là lưu được, mọi ô trống thành "chưa khai"', () => {
    const r = employeeSchema.safeParse(minimal)
    assert.equal(firstError(r), null)
    assert.ok(r.success)
    assert.equal(r.data.phone, undefined)
    assert.equal(r.data.gender, undefined)
    assert.equal(r.data.departmentId, undefined)
    assert.equal(r.data.birthday, undefined)
  })

  it('số điện thoại được gỡ dấu cách trước khi lưu', () => {
    const r = employeeSchema.safeParse({ ...minimal, phone: '0912 345 678' })
    assert.ok(r.success)
    assert.equal(r.data.phone, '0912345678')
  })

  it('email sai định dạng bị chặn, email trống thì không', () => {
    assert.deepEqual(firstError(employeeSchema.safeParse({ ...minimal, email: 'an@' })), {
      path: 'email',
      message: 'Email không hợp lệ',
    })
    assert.ok(employeeSchema.safeParse({ ...minimal, email: '' }).success)
  })

  it('đánh dấu đã nghỉ thì buộc có ngày nghỉ', () => {
    const r = employeeSchema.safeParse({ ...minimal, status: 'left', leftAt: '' })
    assert.deepEqual(firstError(r), {
      path: 'leftAt',
      message: 'Đánh dấu đã nghỉ thì phải nhập ngày nghỉ',
    })
  })

  it('đang làm việc mà vẫn còn ngày nghỉ là mâu thuẫn', () => {
    const r = employeeSchema.safeParse({ ...minimal, status: 'working', leftAt: '2026-01-01' })
    assert.equal(firstError(r)?.path, 'leftAt')
  })

  it('ngày nghỉ không được trước ngày vào làm', () => {
    const r = employeeSchema.safeParse({
      ...minimal,
      hiredAt: '2026-03-01',
      status: 'left',
      leftAt: '2026-01-01',
    })
    assert.deepEqual(firstError(r), {
      path: 'leftAt',
      message: 'Ngày nghỉ phải sau ngày vào làm',
    })
  })

  it('ngày sinh trong tương lai bị chặn', () => {
    const r = employeeSchema.safeParse({ ...minimal, birthday: '2099-01-01' })
    assert.deepEqual(firstError(r), { path: 'birthday', message: 'Ngày sinh phải ở quá khứ' })
  })

  it('mã nhân viên chỉ nhận chữ, số, gạch ngang và gạch dưới', () => {
    assert.equal(firstError(employeeSchema.safeParse({ ...minimal, code: 'NV 001' }))?.path, 'code')
    assert.ok(employeeSchema.safeParse({ ...minimal, code: 'NV-001' }).success)
  })
})
