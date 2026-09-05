/**
 * Kiểu và giá trị mặc định của form nhân viên.
 *
 * Nằm riêng khỏi `employee-form.tsx` vì file kia có `'use client'`: server
 * component import hằng số từ đó chỉ nhận về một client reference rỗng, và
 * `{...EMPTY_EMPLOYEE}` sẽ ra object thiếu trường. Đã mất một lần với form
 * hàng hoá rồi.
 */

export interface Option {
  value: string
  label: string
}

export interface EmployeeFormData {
  id?: string
  code: string
  clockCode: string
  fullName: string
  phone: string
  email: string
  gender: string
  birthday: string
  idNumber: string
  address: string
  departmentId: string
  positionId: string
  workBranchId: string
  payBranchId: string
  hiredAt: string
  leftAt: string
  status: 'working' | 'left'
  bankAccount: string
  bankName: string
  note: string
}

export const EMPTY_EMPLOYEE: EmployeeFormData = {
  code: '',
  clockCode: '',
  fullName: '',
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
  leftAt: '',
  status: 'working',
  bankAccount: '',
  bankName: '',
  note: '',
}

export const GENDER_OPTIONS: Option[] = [
  { value: 'female', label: 'Nữ' },
  { value: 'male', label: 'Nam' },
  { value: 'other', label: 'Khác' },
]

export const GENDER_LABEL: Record<string, string> = {
  female: 'Nữ',
  male: 'Nam',
  other: 'Khác',
}
