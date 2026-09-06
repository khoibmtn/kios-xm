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
    /*
     * KiotViet xuất .xlsx theo **hai phương ngữ khác nhau** — cùng một tài
     * khoản, cùng một ngày. Danh sách hàng hoá và khách hàng dùng bảng chuỗi
     * chung (`xl/sharedStrings.xml`) và thẻ không tiền tố; danh sách nhân viên
     * và bảng hoa hồng lại nhúng chuỗi thẳng vào ô, thẻ có tiền tố `<x:c>`, và
     * không có tệp sharedStrings nào. Thư viện đọc chỉ hiểu phương ngữ thứ
     * nhất, gặp phương ngữ thứ hai thì ném lỗi không nói lên điều gì.
     *
     * Nên câu báo ở đây không đổ cho "tệp .xls cũ" — đó là suy đoán sai và sẽ
     * khiến người dùng đi lưu lại tệp một cách vô ích. Xem `TASKS.md` T-23.
     */
    console.error('[readImportFile]', e)
    return {
      headers: [],
      rows: [],
      error:
        'Chưa đọc được tệp Excel này — nó dùng một biến thể định dạng khác. Cách nhanh nhất: mở bằng Excel rồi lưu lại thành CSV UTF-8 và tải lên lại.',
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
   * KiotViet chèn dòng tiêu đề trang phía trên bảng thật, nên dòng đầu chưa
   * chắc là tiêu đề cột. Chọn theo số ô **khác nhau**, không phải số ô có nội
   * dung: dòng trang trí là một ô gộp, khi xuất ra thì cùng một chuỗi được lặp
   * lại đủ mọi cột ("DANH SÁCH NHÂN VIÊN" ×16) nên đếm ô đầy sẽ hoà với dòng
   * tiêu đề thật và chọn nhầm dòng trên. Tên cột thì luôn khác nhau từng cái.
   */
  const scan = grid.slice(0, 10)
  let headerIndex = 0
  let best = -1

  scan.forEach((row, i) => {
    const values = row.map(cellToString).filter((c) => c !== '')
    const distinct = new Set(values).size
    if (distinct > best) {
      best = distinct
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
