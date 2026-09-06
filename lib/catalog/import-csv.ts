import { KIND_LABEL, type ProductKind } from './labels'

/**
 * Đọc tệp CSV hàng hoá, và ánh xạ cột chung cho cả .xlsx (xem `import-file.ts`).
 *
 * Toàn bộ việc đọc tệp diễn ra trong trình duyệt: không tốn CPU của Worker,
 * không vướng giới hạn kích thước tải lên, và thư viện đọc .xlsx nằm ở chunk
 * tĩnh chứ không vào gói Worker.
 *
 * Ba thứ định dạng phải chịu đựng, đều xuất phát từ Excel bản tiếng Việt:
 *  - Dấu phân cách là **chấm phẩy**, vì dấu phẩy đã dùng làm dấu thập phân.
 *  - Tệp mở đầu bằng **BOM** UTF-8, nếu không gỡ thì tiêu đề cột đầu tiên
 *    không bao giờ khớp.
 *  - Tiền có dấu chấm ngăn nghìn: `1.500.000`.
 */

export interface ParsedRow {
  /** Số dòng trong tệp, tính cả dòng tiêu đề — để báo lỗi đúng chỗ. */
  line: number
  values: Record<string, string>
}

export interface ParseResult {
  headers: string[]
  rows: ParsedRow[]
  /** Lỗi ở mức tệp, ví dụ không có dòng tiêu đề. */
  error?: string
}

/** Đoán dấu phân cách từ dòng đầu: chấm phẩy hay dấu phẩy, cái nào nhiều hơn. */
function detectDelimiter(firstLine: string): string {
  let semicolons = 0
  let commas = 0
  let inQuotes = false

  for (let i = 0; i < firstLine.length; i++) {
    const c = firstLine[i]
    if (c === '"') inQuotes = !inQuotes
    else if (!inQuotes && c === ';') semicolons++
    else if (!inQuotes && c === ',') commas++
  }
  return semicolons >= commas ? ';' : ','
}

/**
 * Tách CSV theo đúng RFC 4180: dấu nháy kép bọc ô, `""` là một dấu nháy, và ô
 * có nháy được phép chứa cả xuống dòng. Tên hàng của spa hay có dấu phẩy
 * ("Chăm sóc da mụn, phục hồi") nên tách bằng `split` sẽ hỏng ngay dòng đầu.
 */
function splitCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const c = text[i]

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += c
      i++
      continue
    }

    if (c === '"') {
      inQuotes = true
      i++
      continue
    }
    if (c === delimiter) {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (c === '\r') {
      i++
      continue
    }
    if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      continue
    }

    field += c
    i++
  }

  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

export function parseCsv(text: string): ParseResult {
  // BOM: vô hình trên màn hình nhưng dính vào tên cột đầu tiên
  const clean = text.replace(/^﻿/, '')
  if (clean.trim() === '') return { headers: [], rows: [], error: 'Tệp rỗng.' }

  const firstLine = clean.slice(0, clean.indexOf('\n') === -1 ? undefined : clean.indexOf('\n'))
  const grid = splitCsv(clean, detectDelimiter(firstLine))

  const headerRow = grid.shift()
  if (!headerRow) return { headers: [], rows: [], error: 'Không đọc được dòng tiêu đề.' }

  const headers = headerRow.map((h) => h.trim())

  const rows: ParsedRow[] = grid
    .map((cells, index) => ({
      line: index + 2, // +1 vì tiêu đề, +1 vì người dùng đếm từ 1
      values: Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? '').trim()])),
    }))
    // Excel hay để lại vài dòng trống ở cuối tệp
    .filter((r) => Object.values(r.values).some((v) => v !== ''))

  return { headers, rows }
}

/**
 * Tên cột chấp nhận được, tính cả cách gọi của KiotViet để tệp xuất từ đó nhập
 * thẳng vào được. So khớp không phân biệt hoa thường và dấu cách thừa.
 */
const COLUMN_ALIASES: Record<string, string[]> = {
  code: ['mã hàng', 'mã hàng hóa', 'mã hàng hoá', 'ma hang', 'code'],
  name: ['tên hàng', 'tên hàng hóa', 'tên hàng hoá', 'ten hang', 'name'],
  kind: ['loại', 'loại hàng', 'loai', 'kind'],
  categoryName: ['nhóm hàng', 'nhóm hàng hóa', 'nhom hang', 'category'],
  brandName: ['thương hiệu', 'thuong hieu', 'brand'],
  unitName: ['đơn vị', 'đơn vị tính', 'đvt', 'don vi tinh', 'unit'],
  basePrice: ['giá bán', 'gia ban', 'price'],
  cost: ['giá vốn', 'gia von', 'cost'],
  durationMinutes: ['thời lượng', 'thoi luong', 'duration'],
  cardFaceValue: ['mệnh giá', 'menh gia'],
  cardBonusValue: ['tặng thêm', 'tang them'],
  minQuantity: ['tồn tối thiểu', 'tồn nhỏ nhất', 'ton toi thieu'],
  maxQuantity: ['tồn tối đa', 'tồn lớn nhất', 'ton toi da'],
  isActive: ['trạng thái', 'đang kinh doanh', 'trang thai', 'status'],
  allowsSale: ['được bán trực tiếp', 'cho phép bán'],
  validityType: ['loại hsd', 'hạn sử dụng'],
  validityValue: ['chi tiết hsd'],
  /** "SP000243:3" với gói, "SP000046:0.01|SP000061:1" với định mức dịch vụ. */
  componentsRaw: ['dịch vụ/thành phần', 'thành phần', 'định mức'],
  description: ['mô tả', 'mo ta', 'description'],
}

/*
 * Bỏ phần trong ngoặc trước khi so khớp: KiotViet ghi "Nhóm hàng(3 Cấp)" và
 * "Hình ảnh (url1,url2...)". Phần trong ngoặc là chú thích cho người đọc, đưa
 * vào bảng tên cột thì mỗi lần họ sửa chú thích là một lần ánh xạ hỏng.
 */
const normalise = (s: string) =>
  s
    .replace(/\([^)]*\)/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

/** Ánh xạ tiêu đề trong tệp về tên trường nội bộ. */
export function mapHeaders(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {}

  for (const header of headers) {
    const key = normalise(header)
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (aliases.includes(key)) {
        mapping[field] = header
        break
      }
    }
  }
  return mapping
}

const KIND_BY_LABEL = new Map<string, ProductKind>(
  (Object.keys(KIND_LABEL) as ProductKind[]).map((k) => [normalise(KIND_LABEL[k]), k]),
)

/** Cách gọi khác cho loại hàng, gồm cả tiếng Anh và tên KiotViet dùng. */
const KIND_ALIASES: Record<string, ProductKind> = {
  'sản phẩm': 'product',
  'hàng hóa': 'product',
  'hàng hoá': 'product',
  product: 'product',
  'dịch vụ': 'service',
  service: 'service',
  'gói dịch vụ': 'package',
  'gói dịch vụ, liệu trình': 'package',
  'gói': 'package',
  'liệu trình': 'package',
  package: 'package',
  'thẻ tài khoản': 'card',
  'thẻ': 'card',
  card: 'card',
}

export function parseKind(raw: string): ProductKind | null {
  const key = normalise(raw)
  return KIND_BY_LABEL.get(key) ?? KIND_ALIASES[key] ?? null
}

/** "1.500.000" hoặc "1500000" → "1500000". Trả chuỗi để schema tự kiểm tra tiếp. */
export function normaliseMoney(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '')
  return digits
}

/** Một dòng "MÃ:SỐ" trong cột thành phần. */
export interface ComponentRef {
  code: string
  quantity: number
}

/**
 * Cột "Dịch vụ/Thành phần" của KiotViet chở hai thứ khác nhau tuỳ loại hàng:
 *  - Gói:      `SP000243:3`  → dịch vụ SP000243, 3 buổi
 *  - Dịch vụ:  `SP000046:0.01|SP000061:1` → định mức nguyên vật liệu mỗi buổi
 *
 * Nhờ vậy một tệp phẳng vẫn chở đủ cấu trúc gói và công thức tiêu hao — điều
 * tôi đã kết luận vội là không thể trước khi xem tệp thật.
 */
export function parseComponentRefs(raw: string): ComponentRef[] {
  if (!raw.trim()) return []

  return raw
    .split('|')
    .map((part) => {
      const [code, qty] = part.split(':')
      const quantity = Number((qty ?? '').replace(/[^\d.]/g, ''))
      return { code: (code ?? '').trim().toUpperCase(), quantity }
    })
    .filter((c) => c.code !== '' && Number.isFinite(c.quantity) && c.quantity > 0)
}

export interface ImportRow {
  line: number
  code: string
  name: string
  kind: ProductKind
  categoryName: string
  brandName: string
  unitName: string
  basePrice: string
  cost: string
  durationMinutes: string
  cardFaceValue: string
  cardBonusValue: string
  minQuantity: string
  maxQuantity: string
  description: string
  isActive: boolean
  allowsSale: boolean
  validityType: 'days' | 'months' | 'unlimited'
  validityValue: string
  /** Buổi trong gói, hoặc định mức nguyên vật liệu của dịch vụ. */
  components: ComponentRef[]
}

export interface RowProblem {
  line: number
  message: string
}

/**
 * Chuyển các dòng thô thành dữ liệu sẵn sàng ghi, kèm danh sách dòng bị loại.
 *
 * Chỉ kiểm những thứ *chỉ ở đây mới biết được* — thiếu cột bắt buộc, loại hàng
 * không đọc được, trùng mã ngay trong tệp. Kiểm tra nghiệp vụ (giá âm, dịch vụ
 * thiếu thời lượng…) để nguyên cho `productSchema` phía máy chủ, tránh hai nơi
 * cùng định nghĩa một luật rồi lệch nhau.
 */
const unsetIfZero = (v: string) => (Number(v) === 0 ? '' : v)

/** Giữ lại chữ số và dấu thập phân; "1.234,5" kiểu Việt về "1234.5". */
function numeric(raw: string): string {
  const cleaned = raw.replace(/[^\d.,]/g, '')
  // Dấu phẩy là thập phân trong tiếng Việt, dấu chấm là ngăn nghìn
  return cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned
}

/**
 * "Vô thời hạn" / "30 ngày" / "12 tháng" → cặp (kiểu, số).
 * KiotViet để trống với hàng không có hạn dùng, nên trống cũng là vô thời hạn.
 */
function parseValidity(
  type: string,
  detail: string,
): { validityType: 'days' | 'months' | 'unlimited'; validityValue: string } {
  const text = `${type} ${detail}`.toLowerCase()
  const number = text.match(/\d+/)?.[0] ?? ''

  if (/tháng|thang|month/.test(text) && number) {
    return { validityType: 'months', validityValue: number }
  }
  if (/ngày|ngay|day/.test(text) && number) {
    return { validityType: 'days', validityValue: number }
  }
  return { validityType: 'unlimited', validityValue: '' }
}

export interface ImportPlan {
  rows: ImportRow[]
  problems: RowProblem[]
  missingColumns: string[]
  /** Cột trong tệp đã hiểu được, kèm trường tương ứng — để người dùng đối chiếu. */
  usedColumns: { header: string; field: string }[]
  /** Cột có trong tệp nhưng phần mềm chưa dùng tới. */
  ignoredColumns: string[]
}

/** Nhãn tiếng Việt của từng trường, dùng khi khoe bảng ánh xạ cột. */
export const FIELD_LABEL: Record<string, string> = {
  code: 'Mã hàng',
  name: 'Tên hàng',
  kind: 'Loại',
  categoryName: 'Nhóm hàng',
  brandName: 'Thương hiệu',
  unitName: 'Đơn vị',
  basePrice: 'Giá bán',
  cost: 'Giá vốn',
  durationMinutes: 'Thời lượng',
  cardFaceValue: 'Mệnh giá',
  cardBonusValue: 'Tặng thêm',
  minQuantity: 'Tồn tối thiểu',
  isActive: 'Trạng thái',
  description: 'Mô tả',
  maxQuantity: 'Tồn tối đa',
  allowsSale: 'Cho phép bán',
  validityType: 'Hạn dùng',
  validityValue: 'Chi tiết hạn dùng',
  componentsRaw: 'Thành phần / định mức',
}

export function toImportRows(parsed: ParseResult): ImportPlan {
  const mapping = mapHeaders(parsed.headers)

  /*
   * Khoe rõ cột nào hiểu được, cột nào bỏ qua. Tệp xuất từ phần mềm khác luôn
   * có cột lạ, và khi con số nhập vào không như mong đợi thì câu hỏi đầu tiên
   * bao giờ cũng là "nó đọc cột nào?". Trả lời sẵn còn hơn để người dùng đoán.
   */
  const usedColumns = Object.entries(mapping).map(([field, header]) => ({ field, header }))
  const usedHeaders = new Set(usedColumns.map((c) => c.header))
  const ignoredColumns = parsed.headers.filter((h) => h !== '' && !usedHeaders.has(h))

  const missingColumns = (['name', 'kind', 'basePrice'] as const).filter((f) => !mapping[f])
  if (missingColumns.length > 0) {
    return { rows: [], problems: [], missingColumns, usedColumns, ignoredColumns }
  }

  const get = (row: ParsedRow, field: string) =>
    mapping[field] ? (row.values[mapping[field]] ?? '') : ''

  const rows: ImportRow[] = []
  const problems: RowProblem[] = []
  const seenCodes = new Set<string>()

  for (const row of parsed.rows) {
    const name = get(row, 'name')
    if (!name) {
      problems.push({ line: row.line, message: 'Thiếu tên hàng' })
      continue
    }

    const kind = parseKind(get(row, 'kind'))
    if (!kind) {
      problems.push({
        line: row.line,
        message: `Không hiểu loại hàng "${get(row, 'kind')}" — nhận: Sản phẩm, Dịch vụ, Gói dịch vụ, Thẻ tài khoản`,
      })
      continue
    }

    const code = get(row, 'code').toUpperCase()
    if (code && seenCodes.has(code)) {
      problems.push({ line: row.line, message: `Mã "${code}" xuất hiện hai lần trong tệp` })
      continue
    }
    if (code) seenCodes.add(code)

    rows.push({
      line: row.line,
      code,
      name,
      kind,
      categoryName: get(row, 'categoryName'),
      brandName: get(row, 'brandName'),
      unitName: get(row, 'unitName'),
      basePrice: normaliseMoney(get(row, 'basePrice')),
      cost: normaliseMoney(get(row, 'cost')),
      durationMinutes: get(row, 'durationMinutes').replace(/[^\d]/g, ''),
      cardFaceValue: normaliseMoney(get(row, 'cardFaceValue')),
      cardBonusValue: normaliseMoney(get(row, 'cardBonusValue')),
      /*
       * KiotViet ghi 0 cho "chưa cấu hình định mức tồn", không phải "định mức
       * bằng 0". Giữ nguyên số 0 sẽ biến mọi sản phẩm thành dưới định mức ngay
       * khi bán hết, và cảnh báo kêu suốt thì chẳng ai còn nhìn.
       */
      minQuantity: unsetIfZero(numeric(get(row, 'minQuantity'))),
      maxQuantity: unsetIfZero(numeric(get(row, 'maxQuantity'))),
      description: get(row, 'description'),
      /*
       * KiotViet ghi 1/0, phần mềm khác ghi chữ. Chỉ "0" hoặc chữ mang nghĩa
       * ngừng mới tắt; thiếu cột thì mặc định đang bán, vì tệp danh mục hầu
       * như luôn là hàng đang kinh doanh.
       */
      isActive: !/^0$|ngừng|ngung|inactive|khóa|khoa/i.test(get(row, 'isActive').trim()),
      allowsSale: !/^0$|không|khong/i.test(get(row, 'allowsSale').trim()),
      ...parseValidity(get(row, 'validityType'), get(row, 'validityValue')),
      components: parseComponentRefs(get(row, 'componentsRaw')),
    })
  }

  return { rows, problems, missingColumns: [], usedColumns, ignoredColumns }
}
