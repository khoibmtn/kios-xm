import type { ParseResult } from '@/lib/catalog/import-csv'

/**
 * Ánh xạ tệp danh sách khách hàng của KiotViet sang dữ liệu của phần mềm này.
 *
 * Tách khỏi bộ ánh xạ hàng hoá vì tên cột và luật kiểm tra khác hẳn, dù cùng
 * dùng chung bộ đọc tệp (`lib/catalog/import-file.ts`).
 */

const COLUMN_ALIASES: Record<string, string[]> = {
  code: ['mã khách hàng', 'ma khach hang', 'mã kh', 'code'],
  name: ['tên khách hàng', 'ten khach hang', 'tên khách', 'name'],
  phone: ['điện thoại', 'số điện thoại', 'dien thoai', 'phone'],
  email: ['email'],
  gender: ['giới tính', 'gioi tinh', 'gender'],
  birthday: ['ngày sinh', 'ngay sinh', 'sinh nhật', 'birthday'],
  province: ['tỉnh/thành phố', 'tỉnh thành', 'province'],
  ward: ['xã/phường', 'phường/xã', 'ward'],
  address: ['địa chỉ', 'dia chi', 'address'],
  /*
   * Việt Nam sáp nhập đơn vị hành chính năm 2025, nên tệp có cả tên mới lẫn
   * tên cũ. Dữ liệu của spa hầu như chỉ nằm ở cột cũ — bỏ đi là mất phần lớn
   * thông tin địa lý, nên giữ cả hai.
   */
  formerArea: ['khu vực cũ', 'khu vực cũ (khách hàng)'],
  formerWard: ['phường/xã cũ', 'phường/xã cũ (khách hàng)'],
  company: ['công ty', 'cong ty', 'company'],
  taxCode: ['mã số thuế', 'ma so thue'],
  facebook: ['facebook'],
  source: ['nguồn khách', 'nguon khach', 'source'],
  groupName: ['nhóm khách hàng', 'nhom khach hang'],
  note: ['ghi chú', 'ghi chu', 'note'],
  isActive: ['trạng thái', 'trang thai', 'status'],
  branchName: ['chi nhánh', 'chi nhanh'],

  // Ảnh chụp từ hệ cũ — xem `drizzle/0008_customers.sql`
  visits: ['ghé thăm', 'ghe tham', 'số lần ghé'],
  totalSpent: ['tổng bán trừ trả hàng', 'tổng bán', 'tong ban'],
  debt: ['nợ cần thu hiện tại', 'nợ hiện tại', 'công nợ'],
  cardBalance: ['số dư thẻ tk', 'số dư thẻ tài khoản'],
  remainingSessions: ['số buổi còn lại gói dv, liệu trình', 'số buổi còn lại'],
  firstVisitAt: ['ngày giao dịch đầu'],
  lastVisitAt: ['ngày giao dịch cuối'],
}

const normalise = (s: string) =>
  s
    .replace(/\([^)]*\)/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

export function mapCustomerHeaders(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {}

  for (const header of headers) {
    const key = normalise(header)
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      // Cột đã khớp rồi thì không cho cột sau ghi đè: "Tổng bán trừ trả hàng"
      // và "Tổng bán" cùng trỏ về một trường, phải giữ cái khớp trước.
      if (mapping[field]) continue
      if (aliases.includes(key)) {
        mapping[field] = header
        break
      }
    }
  }
  return mapping
}

export const CUSTOMER_FIELD_LABEL: Record<string, string> = {
  code: 'Mã khách',
  name: 'Tên khách',
  phone: 'Điện thoại',
  email: 'Email',
  gender: 'Giới tính',
  birthday: 'Ngày sinh',
  province: 'Tỉnh/Thành',
  ward: 'Xã/Phường',
  address: 'Địa chỉ',
  formerArea: 'Khu vực (cũ)',
  formerWard: 'Phường/Xã (cũ)',
  company: 'Công ty',
  taxCode: 'Mã số thuế',
  facebook: 'Facebook',
  source: 'Nguồn khách',
  groupName: 'Nhóm khách',
  note: 'Ghi chú',
  isActive: 'Trạng thái',
  branchName: 'Chi nhánh',
  visits: 'Lượt ghé (hệ cũ)',
  totalSpent: 'Tổng chi tiêu (hệ cũ)',
  debt: 'Công nợ (hệ cũ)',
  cardBalance: 'Số dư thẻ (hệ cũ)',
  remainingSessions: 'Buổi còn lại (hệ cũ)',
  firstVisitAt: 'Giao dịch đầu',
  lastVisitAt: 'Giao dịch cuối',
}

export interface CustomerImportRow {
  line: number
  code: string
  name: string
  phone: string
  email: string
  gender: 'male' | 'female' | 'other' | null
  birthday: string
  province: string
  ward: string
  address: string
  formerArea: string
  formerWard: string
  company: string
  taxCode: string
  facebook: string
  source: string
  groupName: string
  note: string
  isActive: boolean
  visits: number | null
  totalSpent: string
  debt: string
  cardBalance: string
  remainingSessions: number | null
  firstVisitAt: string
  lastVisitAt: string
}

export interface CustomerImportPlan {
  rows: CustomerImportRow[]
  problems: { line: number; message: string }[]
  missingColumns: string[]
  usedColumns: { header: string; field: string }[]
  ignoredColumns: string[]
}

/** Người Việt gõ số điện thoại kèm dấu cách, chấm, ngoặc tuỳ thói quen. */
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

/** Chỉ giữ số; "1.234.567" và "1234567" đều về "1234567". */
const money = (raw: string) => raw.replace(/[^\d]/g, '')

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const toDate = (raw: string) => (DATE_RE.test(raw.trim()) ? raw.trim() : '')

export function toCustomerRows(parsed: ParseResult): CustomerImportPlan {
  const mapping = mapCustomerHeaders(parsed.headers)

  const usedColumns = Object.entries(mapping).map(([field, header]) => ({ field, header }))
  const usedHeaders = new Set(usedColumns.map((c) => c.header))
  const ignoredColumns = parsed.headers.filter((h) => h !== '' && !usedHeaders.has(h))

  const missingColumns = (['name'] as const).filter((f) => !mapping[f])
  if (missingColumns.length > 0) {
    return { rows: [], problems: [], missingColumns, usedColumns, ignoredColumns }
  }

  const get = (row: (typeof parsed.rows)[number], field: string) =>
    mapping[field] ? (row.values[mapping[field]] ?? '') : ''

  const rows: CustomerImportRow[] = []
  const problems: { line: number; message: string }[] = []
  const seen = new Set<string>()

  for (const row of parsed.rows) {
    const name = get(row, 'name').trim()
    if (!name) {
      problems.push({ line: row.line, message: 'Thiếu tên khách hàng' })
      continue
    }

    const code = get(row, 'code').trim().toUpperCase()
    if (code && seen.has(code)) {
      problems.push({ line: row.line, message: `Mã "${code}" xuất hiện hai lần trong tệp` })
      continue
    }
    if (code) seen.add(code)

    const visits = Number(get(row, 'visits').replace(/[^\d]/g, ''))
    const sessions = Number(get(row, 'remainingSessions').replace(/[^\d-]/g, ''))

    rows.push({
      line: row.line,
      code,
      name,
      phone: cleanPhone(get(row, 'phone')),
      email: get(row, 'email').trim(),
      gender: parseGender(get(row, 'gender')),
      birthday: toDate(get(row, 'birthday')),
      province: get(row, 'province').trim(),
      ward: get(row, 'ward').trim(),
      address: get(row, 'address').trim(),
      formerArea: get(row, 'formerArea').trim(),
      formerWard: get(row, 'formerWard').trim(),
      company: get(row, 'company').trim(),
      taxCode: get(row, 'taxCode').trim(),
      facebook: get(row, 'facebook').trim(),
      source: get(row, 'source').trim(),
      groupName: get(row, 'groupName').trim(),
      note: get(row, 'note').trim(),
      // KiotViet ghi 1/0; phần mềm khác ghi chữ. Thiếu cột thì mặc định đang hoạt động.
      isActive: !/^0$|ngừng|ngung|khoá|khoa|inactive/i.test(get(row, 'isActive').trim()),
      visits: Number.isFinite(visits) && get(row, 'visits') !== '' ? visits : null,
      totalSpent: money(get(row, 'totalSpent')),
      debt: money(get(row, 'debt')),
      cardBalance: money(get(row, 'cardBalance')),
      remainingSessions:
        Number.isFinite(sessions) && get(row, 'remainingSessions') !== '' ? sessions : null,
      firstVisitAt: toDate(get(row, 'firstVisitAt')),
      lastVisitAt: toDate(get(row, 'lastVisitAt')),
    })
  }

  return { rows, problems, missingColumns: [], usedColumns, ignoredColumns }
}
