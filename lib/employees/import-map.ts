import type { ParseResult } from '@/lib/catalog/import-csv'
import { parseImportDate } from '@/lib/catalog/import-csv'

/**
 * Ánh xạ bản xuất "Danh sách nhân viên" của KiotViet.
 *
 * Tệp này dùng **phương ngữ .xlsx thứ hai** của KiotViet, nên chỉ đọc được từ
 * khi có `lib/catalog/xlsx-min.ts` (T-23). Trước đó nó là tệp duy nhất phải
 * chuyển tay sang CSV.
 */

const COLUMN_ALIASES: Record<string, string[]> = {
  code: ['mã nhân viên', 'ma nhan vien'],
  fullName: ['tên nhân viên', 'ten nhan vien'],
  phone: ['số điện thoại', 'điện thoại', 'so dien thoai'],
  idNumber: ['số cmnd/cccd', 'số cmnd', 'cccd'],
  birthday: ['ngày sinh', 'ngay sinh'],
  gender: ['giới tính', 'gioi tinh'],
  payBranch: ['chi nhánh trả lương'],
  workBranch: ['chi nhánh làm việc'],
  hiredAt: ['ngày bắt đầu làm việc'],
  department: ['phòng ban', 'phong ban'],
  position: ['chức danh', 'chuc danh'],
  loginAccount: ['tài khoản đăng nhập'],
  address: ['địa chỉ', 'dia chi'],
  email: ['email'],
}

/*
 * Hai cột cố tình không đọc:
 *
 *   "STT" — số thứ tự trong bản xuất, không phải dữ liệu.
 *   "Facebook" — hồ sơ nhân viên của phần mềm này chưa có chỗ cho nó. Thà bỏ
 *   qua công khai (tên cột hiện trong "Bỏ qua N cột") còn hơn nhét vào ô ghi
 *   chú, nơi không ai tìm lại được.
 *
 * "Tài khoản đăng nhập" thì có đọc, nhưng **chỉ để báo cáo**: cấp tài khoản là
 * việc của T-22 và phải qua đặt mật khẩu, không thể suy ra từ một ô trong tệp.
 */

const normalise = (s: string) =>
  s
    .replace(/\([^)]*\)/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

export function mapEmployeeHeaders(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {}
  for (const header of headers) {
    const key = normalise(header)
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (mapping[field]) continue
      if (aliases.includes(key)) {
        mapping[field] = header
        break
      }
    }
  }
  return mapping
}

export const EMPLOYEE_FIELD_LABEL: Record<string, string> = {
  code: 'Mã nhân viên',
  fullName: 'Tên nhân viên',
  phone: 'Điện thoại',
  idNumber: 'CMND/CCCD',
  birthday: 'Ngày sinh',
  gender: 'Giới tính',
  payBranch: 'Chi nhánh trả lương',
  workBranch: 'Chi nhánh làm việc',
  hiredAt: 'Ngày vào làm',
  department: 'Phòng ban',
  position: 'Chức danh',
  loginAccount: 'Tài khoản đăng nhập',
  address: 'Địa chỉ',
  email: 'Email',
}

export interface EmployeeImportRow {
  line: number
  code: string
  fullName: string
  phone: string
  idNumber: string
  birthday: string
  gender: 'male' | 'female' | 'other' | null
  payBranch: string
  workBranch: string
  hiredAt: string
  department: string
  position: string
  loginAccount: string
  address: string
  email: string
}

export interface EmployeeImportPlan {
  rows: EmployeeImportRow[]
  problems: { line: number; message: string }[]
  missingColumns: string[]
  usedColumns: { header: string; field: string }[]
  ignoredColumns: string[]
}

function cleanPhone(raw: string): string {
  const digits = raw.replace(/[\s.\-()]/g, '')
  return /^\+?\d{8,15}$/.test(digits) ? digits : ''
}

function parseGender(raw: string): 'male' | 'female' | 'other' | null {
  const v = raw.trim().toLowerCase()
  if (/^(nữ|nu|female|f)$/.test(v)) return 'female'
  if (/^(nam|male|m)$/.test(v)) return 'male'
  if (v === '') return null
  return 'other'
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function toEmployeeRows(parsed: ParseResult): EmployeeImportPlan {
  const mapping = mapEmployeeHeaders(parsed.headers)

  const usedColumns = Object.entries(mapping).map(([field, header]) => ({ field, header }))
  const usedHeaders = new Set(usedColumns.map((c) => c.header))
  const ignoredColumns = parsed.headers.filter((h) => h !== '' && !usedHeaders.has(h))

  const missingColumns = (['code', 'fullName'] as const).filter((f) => !mapping[f])
  if (missingColumns.length > 0) {
    return { rows: [], problems: [], missingColumns, usedColumns, ignoredColumns }
  }

  const get = (row: (typeof parsed.rows)[number], field: string) =>
    mapping[field] ? (row.values[mapping[field]] ?? '') : ''

  const rows: EmployeeImportRow[] = []
  const problems: { line: number; message: string }[] = []
  const seen = new Set<string>()

  for (const row of parsed.rows) {
    const code = get(row, 'code').trim().toUpperCase()
    if (!code) {
      problems.push({ line: row.line, message: 'Thiếu mã nhân viên' })
      continue
    }
    const fullName = get(row, 'fullName').trim()
    if (!fullName) {
      problems.push({ line: row.line, message: 'Thiếu tên nhân viên' })
      continue
    }
    if (seen.has(code)) {
      problems.push({ line: row.line, message: `Mã "${code}" xuất hiện hai lần trong tệp` })
      continue
    }
    seen.add(code)

    const email = get(row, 'email').trim()
    if (email && !EMAIL_RE.test(email)) {
      problems.push({ line: row.line, message: `Email "${email}" không hợp lệ` })
      continue
    }

    rows.push({
      line: row.line,
      code,
      fullName,
      phone: cleanPhone(get(row, 'phone')),
      idNumber: get(row, 'idNumber').trim(),
      birthday: parseImportDate(get(row, 'birthday')),
      gender: parseGender(get(row, 'gender')),
      payBranch: get(row, 'payBranch').trim(),
      workBranch: get(row, 'workBranch').trim(),
      hiredAt: parseImportDate(get(row, 'hiredAt')),
      department: get(row, 'department').trim(),
      position: get(row, 'position').trim(),
      loginAccount: get(row, 'loginAccount').trim(),
      address: get(row, 'address').trim(),
      email,
    })
  }

  return { rows, problems, missingColumns: [], usedColumns, ignoredColumns }
}
