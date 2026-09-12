import type { ParseResult } from '@/lib/catalog/import-csv'

/**
 * Ánh xạ tệp "Danh sách thẻ dịch vụ" (gói/liệu trình khách đã mua) của
 * KiotViet sang dữ liệu nạp cho `customer_packages` và
 * `customer_package_items` — xem `drizzle/0009_customer_packages.sql`.
 *
 * Tách khỏi `lib/customers/import-map.ts` vì đây là một tệp xuất khác hẳn (thẻ
 * dịch vụ khách đã mua, không phải hồ sơ khách hàng) dù cùng dùng chung bộ đọc
 * tệp (`lib/catalog/import-csv.ts` / `import-file.ts`) và cùng bám theo quy
 * ước ánh xạ cột của tệp đó.
 */

const COLUMN_ALIASES: Record<string, string[]> = {
  code: ['mã thẻ dịch vụ', 'ma the dich vu'],
  packageName: ['tên thẻ dịch vụ', 'ten the dich vu'],
  customerName: ['khách hàng', 'khach hang'],
  customerPhone: ['điện thoại', 'dien thoai'],
  soldAt: ['ngày bán', 'ngay ban'],
  invoiceCode: ['hóa đơn bán', 'hoa don ban'],
  price: ['giá bán', 'gia ban'],
  serviceName: ['dịch vụ trong gói', 'dich vu trong goi'],
  totalSessions: ['tổng sl', 'tong sl'],
  usedSessions: ['sl đã dùng', 'sl da dung'],
  returnedSessions: ['sl đã trả', 'sl da tra'],
  reservedSessions: ['sl đã đặt', 'sl da dat'],
  lastUsedAt: ['sd gần nhất', 'sd gan nhat'],
  expiresAt: ['hsd'],
}

/*
 * 8 cột dưới đây bị bỏ qua có chủ đích. Không đưa vào `COLUMN_ALIASES` là đủ
 * để chúng tự rơi vào `ignoredColumns` của kết quả trả về — không cần một
 * danh sách loại trừ riêng.
 *
 *   "Giá trị còn lại", "Nhóm khách hàng", "Trạng thái" — không phải dữ liệu
 *   gốc: giá trị còn lại suy ra được từ số buổi × đơn giá phân bổ, nhóm khách
 *   đã có ở hồ sơ khách hàng (`lib/customers/import-map.ts`), còn trạng thái
 *   gói do trigger `sync_customer_package_status` tự tính từ số buổi còn lại.
 *
 *   "Tổng", "Đã dùng", "Đã trả", "Còn lại" — TRÙNG Ý NGHĨA với "Tổng SL"/"SL
 *   đã dùng"/"SL đã trả"/"SL còn lại", nhưng KiotViet xuất 4 cột này dưới dạng
 *   NGÀY THÁNG (serial Excel) thay vì số nguyên, nên bộ đọc tệp trả ra ngày vô
 *   nghĩa cho chúng. Bản có hậu tố "SL" mới là số đáng tin.
 *
 *   "SL còn lại" — trông giống hệt trường ta cần (`remainingSessions`) nhưng
 *   KiotViet đã trừ luôn cả "SL đã đặt" ra khỏi số này. Buổi đã đặt lịch
 *   nhưng khách chưa tới làm thì spa vẫn còn nợ buổi đó — dùng số đã trừ sẵn
 *   sẽ báo nhầm là hết gói trong khi khách còn buổi chưa dùng. Số đúng phải tự
 *   tính lại: `totalSessions - usedSessions - returnedSessions` (xem
 *   `remainingSessions` trong `toPackageRows` bên dưới).
 */

/*
 * Bỏ phần trong ngoặc trước khi so khớp TÊN CỘT — không liên quan tới việc cắt
 * hậu tố đơn vị của TÊN DỊCH VỤ (đó là `stripUnitSuffix`, xử lý dữ liệu chứ
 * không phải tiêu đề). Giữ giống hệt `lib/customers/import-map.ts` để hai bộ
 * ánh xạ không lệch quy ước so khớp cột.
 */
const normalise = (s: string) =>
  s
    .replace(/\([^)]*\)/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

export function mapPackageHeaders(headers: string[]): Record<string, string> {
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

export const PACKAGE_FIELD_LABEL: Record<string, string> = {
  code: 'Mã thẻ dịch vụ',
  packageName: 'Tên thẻ dịch vụ',
  customerName: 'Khách hàng',
  customerPhone: 'Điện thoại',
  soldAt: 'Ngày bán',
  invoiceCode: 'Hóa đơn bán',
  price: 'Giá bán',
  serviceName: 'Dịch vụ trong gói',
  totalSessions: 'Tổng số buổi',
  usedSessions: 'Buổi đã dùng',
  returnedSessions: 'Buổi đã trả',
  reservedSessions: 'Buổi đã đặt',
  lastUsedAt: 'Sử dụng gần nhất',
  expiresAt: 'Hạn sử dụng',
}

export interface PackageImportRow {
  line: number
  code: string
  packageName: string
  customerName: string
  customerPhone: string
  soldAt: string
  invoiceCode: string
  price: string
  serviceName: string
  totalSessions: number
  usedSessions: number
  returnedSessions: number
  reservedSessions: number
  /** Dẫn xuất, KHÔNG đọc từ cột "SL còn lại" — xem lý do ở khối chú thích trên. */
  remainingSessions: number
  lastUsedAt: string
  expiresAt: string
}

export interface PackageImportPlan {
  rows: PackageImportRow[]
  problems: { line: number; message: string }[]
  missingColumns: string[]
  usedColumns: { header: string; field: string }[]
  ignoredColumns: string[]
}

/** Người Việt gõ số điện thoại kèm dấu cách, chấm, ngoặc tuỳ thói quen — giống hệt bộ nhập khách hàng. */
function cleanPhone(raw: string): string {
  const digits = raw.replace(/[\s.\-()]/g, '')
  return /^\+?\d{8,15}$/.test(digits) ? digits : ''
}

/**
 * Chỉ giữ số; "1.234.567" và "1234567" đều về "1234567".
 *
 * Nhánh đầu tiên là chỗ đã suýt sai tiền gấp trăm lần (`PROGRESS.md` 05/09):
 * người Việt dùng dấu chấm ngăn nghìn, nên gỡ hết dấu chấm sẽ biến
 * "500000.00" — dạng Excel hay sinh ra khi lưu sang CSV — thành 50 triệu. Phân
 * biệt được vì phần ngăn nghìn luôn đủ **ba** chữ số, còn phần thập phân thì
 * một hoặc hai. Ở đây sai con số này không chỉ sai màn hình: nó thành
 * `allocated_per_session`, tức cơ sở tính hoa hồng về sau.
 */
const money = (raw: string) => {
  const trimmed = raw.trim()
  const decimal = /^(\d+)\.(\d{1,2})$/.exec(trimmed)
  if (decimal) return decimal[1]
  return trimmed.replace(/[^\d]/g, '')
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/
const DMY_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/

/**
 * Đọc ngày từ ô KiotViet, trả về `YYYY-MM-DD` hoặc chuỗi rỗng.
 *
 * Phải chấp nhận **hai dạng** vì cùng một phần mềm xuất hai kiểu khác nhau:
 * bản xuất khách hàng cho ô ngày thật (bộ đọc tệp đã đổi sang ISO trước khi
 * tới đây), còn bản xuất thẻ dịch vụ lại ghi **chuỗi `20/07/2026`**. Chỉ nhận
 * ISO thì mọi ngày bán của tệp thẻ dịch vụ lặng lẽ thành rỗng — mà `sold_at`
 * là cột NOT NULL, nên cả lần nhập đổ ở câu chèn với một thông báo chẳng liên
 * quan gì tới định dạng ngày.
 *
 * Giá trị không phải ngày thì về chuỗi rỗng, nhờ vậy dùng được luôn cho "HSD"
 * — giá trị thật là "Vô thời hạn", không cần nhánh riêng.
 */
function toDate(raw: string): string {
  const v = raw.trim()
  if (ISO_RE.test(v)) return v
  const dmy = DMY_RE.exec(v)
  if (!dmy) return ''
  const [, d, m, y] = dmy
  const day = Number(d)
  const month = Number(m)
  if (month < 1 || month > 12 || day < 1 || day > 31) return ''
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

/**
 * "Dịch vụ trong gói" luôn có hậu tố đơn vị trong ngoặc ở CUỐI câu, ví dụ
 * "... (Buổi)" hoặc "... (Lần)". Chỉ cắt đúng ngoặc cuối cùng bằng cách neo
 * `$` — tên dịch vụ như "Meso (HA) cấp ẩm (Lần)" có ngoặc ở giữa, cắt theo
 * ngoặc đầu tiên gặp được sẽ làm gãy tên và không khớp được với `products.name`
 * khi liên kết dữ liệu về sau.
 */
function stripUnitSuffix(raw: string): string {
  return raw
    .trim()
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
}

/** Số nguyên từ ô KiotViet. Ô trống hoặc không đọc được số thì trả về NaN. */
function toInt(raw: string): number {
  const trimmed = raw.trim()
  if (trimmed === '') return NaN
  const digits = trimmed.replace(/[^\d-]/g, '')
  if (digits === '' || digits === '-') return NaN
  const n = Number(digits)
  return Number.isInteger(n) ? n : NaN
}

/**
 * Như `toInt`, nhưng ô trống/hỏng coi là 0 buổi thay vì loại cả dòng. Chỉ
 * "Tổng SL" mới đủ nghiêm trọng để loại dòng khi đọc không ra số — ba cột
 * buổi còn lại chỉ dùng để cộng trừ, thiếu thì cứ coi như chưa phát sinh.
 */
function toIntOrZero(raw: string): number {
  const n = toInt(raw)
  return Number.isNaN(n) ? 0 : n
}

export function toPackageRows(parsed: ParseResult): PackageImportPlan {
  const mapping = mapPackageHeaders(parsed.headers)

  const usedColumns = Object.entries(mapping).map(([field, header]) => ({ field, header }))
  const usedHeaders = new Set(usedColumns.map((c) => c.header))
  const ignoredColumns = parsed.headers.filter((h) => h !== '' && !usedHeaders.has(h))

  const missingColumns = (['code', 'packageName', 'customerName', 'serviceName'] as const).filter(
    (f) => !mapping[f],
  )
  if (missingColumns.length > 0) {
    return { rows: [], problems: [], missingColumns, usedColumns, ignoredColumns }
  }

  const get = (row: (typeof parsed.rows)[number], field: string) =>
    mapping[field] ? (row.values[mapping[field]] ?? '') : ''

  const rows: PackageImportRow[] = []
  const problems: { line: number; message: string }[] = []
  const seen = new Set<string>()

  for (const row of parsed.rows) {
    const code = get(row, 'code').trim().toUpperCase()
    if (!code) {
      problems.push({ line: row.line, message: 'Thiếu mã thẻ dịch vụ' })
      continue
    }

    const customerName = get(row, 'customerName').trim()
    if (!customerName) {
      problems.push({ line: row.line, message: 'Thiếu tên khách hàng' })
      continue
    }

    const packageName = get(row, 'packageName').trim()
    if (!packageName) {
      problems.push({ line: row.line, message: 'Thiếu tên thẻ dịch vụ' })
      continue
    }

    const serviceName = stripUnitSuffix(get(row, 'serviceName'))
    if (!serviceName) {
      problems.push({ line: row.line, message: 'Thiếu dịch vụ trong gói' })
      continue
    }

    if (seen.has(code)) {
      problems.push({ line: row.line, message: `Mã "${code}" xuất hiện hai lần trong tệp` })
      continue
    }
    seen.add(code)

    const totalSessions = toInt(get(row, 'totalSessions'))
    if (!Number.isInteger(totalSessions) || totalSessions <= 0) {
      problems.push({ line: row.line, message: '"Tổng SL" phải là một số nguyên dương' })
      continue
    }

    /*
     * `customer_packages.sold_at` là NOT NULL — một gói đã bán mà không có ngày
     * bán là dữ liệu hỏng. Chặn ở đây để người dùng thấy đúng dòng nào sai, thay
     * vì để câu chèn đổ với thông báo của Postgres.
     */
    const soldAt = toDate(get(row, 'soldAt'))
    if (!soldAt) {
      problems.push({
        line: row.line,
        message: `Không đọc được ngày bán ("${get(row, 'soldAt').trim() || 'để trống'}")`,
      })
      continue
    }

    const usedSessions = toIntOrZero(get(row, 'usedSessions'))
    const returnedSessions = toIntOrZero(get(row, 'returnedSessions'))
    const reservedSessions = toIntOrZero(get(row, 'reservedSessions'))

    if (usedSessions + returnedSessions > totalSessions) {
      problems.push({
        line: row.line,
        message:
          `Sổ sách tự mâu thuẫn: đã dùng (${usedSessions}) + đã trả (${returnedSessions}) ` +
          `vượt quá tổng số buổi (${totalSessions})`,
      })
      continue
    }

    rows.push({
      line: row.line,
      code,
      packageName,
      customerName,
      customerPhone: cleanPhone(get(row, 'customerPhone')),
      soldAt,
      invoiceCode: get(row, 'invoiceCode').trim(),
      price: money(get(row, 'price')),
      serviceName,
      totalSessions,
      usedSessions,
      returnedSessions,
      reservedSessions,
      // Cố ý không đọc cột "SL còn lại" — xem khối chú thích cạnh COLUMN_ALIASES.
      remainingSessions: totalSessions - usedSessions - returnedSessions,
      lastUsedAt: toDate(get(row, 'lastUsedAt')),
      expiresAt: toDate(get(row, 'expiresAt')),
    })
  }

  return { rows, problems, missingColumns: [], usedColumns, ignoredColumns }
}
