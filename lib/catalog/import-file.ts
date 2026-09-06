import { parseCsv, type ParseResult } from './import-csv'

/**
 * Đọc tệp danh mục người dùng chọn, dù là .xlsx hay .csv.
 *
 * Toàn bộ việc đọc diễn ra **trong trình duyệt**, không gửi tệp lên máy chủ.
 * Đây cũng là lý do đọc được .xlsx: thư viện phân tích ZIP + XML nặng gần
 * 2,5 MB, nhưng nó nằm trong chunk phía trình duyệt (tài nguyên tĩnh) chứ
 * không vào gói Worker vốn đã sát trần của gói miễn phí. `import()` động nên
 * chunk đó chỉ tải khi người dùng thật sự chọn một tệp Excel.
 *
 * KiotViet xuất danh mục ra .xlsx, nên đọc thẳng định dạng đó là bỏ hẳn một
 * bước "mở Excel, lưu lại thành CSV" cho mỗi tệp.
 */
export async function readImportFile(file: File): Promise<ParseResult> {
  if (/\.csv$/i.test(file.name)) {
    return parseCsv(await file.text())
  }

  if (!/\.xlsx?$/i.test(file.name)) {
    return { headers: [], rows: [], error: 'Chỉ đọc được tệp .xlsx hoặc .csv.' }
  }

  try {
    // Nhánh `/browser` chứ không phải gói gốc: gói không có export ở gốc, và
    // bản browser bỏ hẳn phần đọc tệp của Node.
    const { default: readXlsxFile } = await import('read-excel-file/browser')
    return gridToParseResult(unwrapSheets(await readXlsxFile(file)))
  } catch (e) {
    console.error('[readImportFile]', e)
    return {
      headers: [],
      rows: [],
      error:
        'Không đọc được tệp Excel này. Nếu tệp có định dạng .xls cũ, hãy mở bằng Excel rồi lưu lại thành .xlsx hoặc CSV.',
    }
  }
}

/**
 * Thư viện trả về **mảng các sheet** `{sheet, data}`, không phải lưới ô.
 * Chấp nhận cả hai dạng để không phụ thuộc vào chi tiết của một phiên bản.
 */
function unwrapSheets(value: unknown): unknown[][] {
  if (!Array.isArray(value)) return []
  const first = value[0]
  if (first && typeof first === 'object' && !Array.isArray(first) && 'data' in first) {
    return ((first as { data: unknown[][] }).data ?? []) as unknown[][]
  }
  return value as unknown[][]
}

/** Mốc 0 của lịch Excel: 30/12/1899. */
const EXCEL_EPOCH = Date.UTC(1899, 11, 30)

/**
 * Ô rỗng về đây là `null`; ô có định dạng ngày thành `Date`.
 *
 * KiotViet xuất các cột **số** (tồn kho, tồn nhỏ nhất, quy đổi) với định dạng
 * ngày, nên thư viện đọc ra `Date` — tồn kho 1 hiện thành 31/12/1899. Ngày
 * trước 1910 trong một tệp danh mục chắc chắn không phải ngày thật, nên đổi
 * ngược về số thứ tự Excel để lấy lại con số ban đầu.
 */
function cellToString(value: unknown): string {
  if (value == null) return ''

  if (value instanceof Date) {
    // Ô ngày hỏng trong tệp thật thì `toISOString` ném lỗi và làm đổ cả lần
    // nhập, nên coi như ô trống.
    if (Number.isNaN(value.getTime())) return ''

    const serial = Math.round((value.getTime() - EXCEL_EPOCH) / 86_400_000)
    if (value.getUTCFullYear() < 1910) return String(serial)
    return value.toISOString().slice(0, 10)
  }

  return String(value).trim()
}

export function gridToParseResult(grid: unknown[][]): ParseResult {
  /*
   * KiotViet chèn vài dòng tiêu đề trang phía trên bảng thật, nên dòng đầu
   * chưa chắc là tiêu đề cột. Lấy dòng **có nhiều ô nhất** trong 10 dòng đầu:
   * dòng tiêu đề bao giờ cũng kín ô nhất, còn dòng trang trí thường chỉ có
   * một ô.
   */
  const scan = grid.slice(0, 10)
  let headerIndex = 0
  let best = -1

  scan.forEach((row, i) => {
    const filled = row.filter((c) => cellToString(c) !== '').length
    if (filled > best) {
      best = filled
      headerIndex = i
    }
  })

  const headerRow = grid[headerIndex]
  if (!headerRow || best < 2) {
    return { headers: [], rows: [], error: 'Không tìm thấy dòng tiêu đề cột trong tệp.' }
  }

  const headers = headerRow.map(cellToString)

  const rows = grid
    .slice(headerIndex + 1)
    .map((cells, index) => ({
      // +1 vì Excel đếm dòng từ 1, +1 nữa để trỏ tới dòng dữ liệu đầu tiên
      line: headerIndex + index + 2,
      values: Object.fromEntries(headers.map((h, i) => [h, cellToString(cells[i])])),
    }))
    .filter((r) => Object.values(r.values).some((v) => v !== ''))

  return { headers, rows }
}
