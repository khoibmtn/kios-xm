/**
 * Bộ đọc .xlsx tối giản, dùng làm phương án dự phòng khi `read-excel-file`
 * không đọc được tệp.
 *
 * Lý do tồn tại: KiotViet xuất .xlsx theo **hai phương ngữ** từ cùng một tài
 * khoản, cùng một ngày (xem `PROGRESS.md` 07/09). Danh sách hàng hoá và khách
 * hàng dùng phương ngữ chuẩn mà mọi thư viện đều hiểu. Danh sách nhân viên và
 * bảng hoa hồng thì khác hẳn:
 *
 *   - mọi thẻ mang tiền tố không gian tên `x:` (`<x:worksheet>`, `<x:c>`)
 *   - **không có `xl/sharedStrings.xml`** — chuỗi nằm thẳng trong `<x:v>`
 *   - ô và dòng **không có thuộc tính `r`** (toạ độ kiểu "B7"), nên vị trí cột
 *     chỉ suy được từ thứ tự xuất hiện
 *   - ô rỗng là thẻ tự đóng `<x:c s="6"/>`
 *
 * Không dùng thư viện nào: giải nén bằng `DecompressionStream('deflate-raw')`
 * có sẵn trong trình duyệt và Node ≥18. Toàn bộ việc đọc tệp diễn ra phía
 * trình duyệt nên không đụng tới kích thước gói Worker.
 *
 * **Giới hạn đã biết — đọc trước khi mở rộng phạm vi dùng.** Bộ đọc này không
 * xem `xl/styles.xml`, nên một ô *số* được định dạng thành ngày sẽ ra số thứ
 * tự Excel (45678) chứ không phải ngày. Hai tệp cần nó hiện nay ghi ngày dạng
 * chuỗi nên không chạm phải; và vì `readImportFile` chỉ gọi tới đây khi thư
 * viện chuẩn đã hỏng, nên đường thường vẫn do thư viện lo. Nếu có ngày rơi vào
 * nhánh này thì nó hỏng theo kiểu **thấy được**: màn hình xem trước hiện một
 * con số lạ và trường ngày bỏ trống, chứ không âm thầm ghi sai ngày.
 */

/** Bảng chữ viết tắt XML mà KiotViet sinh ra; không có CDATA nên chừng này là đủ. */
function decodeXml(raw: string): string {
  return raw.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (whole, entity: string) => {
    switch (entity) {
      case 'amp':
        return '&'
      case 'lt':
        return '<'
      case 'gt':
        return '>'
      case 'quot':
        return '"'
      case 'apos':
        return "'"
      default:
        return entity[1] === 'x' || entity[1] === 'X'
          ? String.fromCodePoint(Number.parseInt(entity.slice(2), 16))
          : String.fromCodePoint(Number.parseInt(entity.slice(1), 10))
    }
  })
}

const attr = (tag: string, name: string): string | undefined =>
  new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1]

/**
 * Chuyển XML của một sheet thành lưới ô.
 *
 * Tách khỏi phần giải nén để kiểm thử được bằng chuỗi XML thuần — phần ZIP cần
 * tệp nhị phân thật nên chỉ đối chiếu tay với bản xuất của spa.
 *
 * Chấp nhận cả hai phương ngữ: thẻ có tiền tố `x:` lẫn không, ô lấy chuỗi từ
 * `sharedStrings` (`t="s"`), chuỗi nội tuyến (`t="inlineStr"`), chuỗi thẳng
 * (`t="str"`) và số (mặc định hoặc `t="n"`).
 */
export function parseSheetXml(xml: string, sharedStrings: string[] = []): unknown[][] {
  const grid: unknown[][] = []

  const rowRe = /<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g
  let rowMatch: RegExpExecArray | null

  while ((rowMatch = rowRe.exec(xml)) !== null) {
    const [, rowAttrs, body = ''] = rowMatch
    const cells: unknown[] = []

    const cellRe = /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g
    let cellMatch: RegExpExecArray | null

    while ((cellMatch = cellRe.exec(body)) !== null) {
      const [, cellAttrs, inner] = cellMatch

      /*
       * Tệp của KiotViet không có `r`, nhưng phương ngữ chuẩn thì có và **bỏ
       * hẳn ô rỗng ở giữa**. Nếu gặp `r` thì phải đệm cho đúng cột, không thì
       * mọi cột sau ô trống đầu tiên lệch đi một — kiểu lỗi làm dữ liệu sai mà
       * nhìn vẫn hợp lý.
       */
      const ref = attr(cellAttrs, 'r')
      if (ref) {
        const column = columnIndex(ref)
        while (cells.length < column) cells.push(null)
      }

      cells.push(cellValue(attr(cellAttrs, 't') ?? '', inner ?? '', sharedStrings))
    }

    const ref = attr(rowAttrs, 'r')
    if (ref) {
      const index = Number.parseInt(ref, 10) - 1
      while (grid.length < index) grid.push([])
    }
    grid.push(cells)
  }

  return grid
}

/** "BC7" → 54. Chỉ phần chữ mới mang số cột. */
function columnIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref.toUpperCase())?.[1]
  if (!letters) return 0
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function cellValue(type: string, inner: string, sharedStrings: string[]): unknown {
  if (type === 'inlineStr') {
    // Có thể nhiều đoạn <t> khi ô có định dạng chữ hỗn hợp — nối lại.
    const parts = [...inner.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)]
    return parts.map((p) => decodeXml(p[1])).join('')
  }

  const raw = /<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/.exec(inner)?.[1]
  if (raw === undefined) return null

  const text = decodeXml(raw)

  if (type === 's') {
    const i = Number.parseInt(text, 10)
    return sharedStrings[i] ?? ''
  }
  if (type === 'str' || type === 'inlineStr') return text
  if (type === 'b') return text === '1'
  if (type === 'e') return null // ô lỗi (#REF!, #N/A…) — coi như trống

  /*
   * Còn lại là số. Trả về **số** chứ không phải chuỗi: KiotViet ghi tiền dạng
   * "6000000.0000", để nguyên chuỗi thì bộ chuẩn hoá tiền tệ phía sau sẽ gỡ
   * dấu chấm và biến 6 triệu thành 60 tỉ (xem `PROGRESS.md` 05/09). `Number`
   * cắt phần thập phân thừa, `String(6000000)` ra đúng "6000000".
   */
  const n = Number(text)
  return Number.isFinite(n) ? n : text
}

export function parseSharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((si) =>
    [...si[1].matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)]
      .map((t) => decodeXml(t[1]))
      .join(''),
  )
}

// ───────────────────────────── Đọc ZIP ─────────────────────────────
//
// .xlsx là một tệp ZIP. Ở đây chỉ cần đọc, và chỉ vài mục, nên tự phân tích
// cấu trúc rẻ hơn kéo về một thư viện: phần giải nén — chỗ khó thật sự — đã có
// sẵn trong nền tảng.

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50

interface ZipEntry {
  name: string
  compression: number
  compressedSize: number
  localOffset: number
}

function readCentralDirectory(view: DataView): ZipEntry[] {
  // Bản ghi kết thúc nằm ở cuối tệp, sau nó chỉ có thể là phần chú thích ≤ 64KB.
  const limit = Math.min(view.byteLength, 0xffff + 22)
  let eocd = -1
  for (let i = view.byteLength - 22; i >= view.byteLength - limit; i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('Không phải tệp ZIP hợp lệ: thiếu bản ghi kết thúc.')

  const count = view.getUint16(eocd + 10, true)
  let offset = view.getUint32(eocd + 16, true)
  if (offset === 0xffffffff) throw new Error('Tệp ZIP64 — chưa hỗ trợ.')

  const decoder = new TextDecoder()
  const entries: ZipEntry[] = []

  for (let i = 0; i < count; i++) {
    if (view.getUint32(offset, true) !== CENTRAL_SIGNATURE) break
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)

    entries.push({
      name: decoder.decode(new Uint8Array(view.buffer, view.byteOffset + offset + 46, nameLength)),
      compression: view.getUint16(offset + 10, true),
      compressedSize: view.getUint32(offset + 20, true),
      localOffset: view.getUint32(offset + 42, true),
    })

    offset += 46 + nameLength + extraLength + commentLength
  }

  return entries
}

async function readEntry(data: ArrayBuffer, view: DataView, entry: ZipEntry): Promise<string> {
  const at = entry.localOffset
  if (view.getUint32(at, true) !== LOCAL_SIGNATURE) {
    throw new Error(`Mục "${entry.name}" trong ZIP hỏng.`)
  }
  /*
   * Độ dài tên và phần phụ ở bản ghi cục bộ **có thể khác** bản ghi trung tâm,
   * nên phải đọc lại tại chỗ chứ không dùng lại số cũ.
   */
  const nameLength = view.getUint16(at + 26, true)
  const extraLength = view.getUint16(at + 28, true)
  const start = at + 30 + nameLength + extraLength

  /*
   * `slice` chứ không phải khung nhìn: `view.buffer` mang kiểu `ArrayBufferLike`
   * (có thể là `SharedArrayBuffer`) nên không truyền thẳng vào `Blob` được, và
   * một bản sao của vài chục KB thì rẻ hơn nhiều so với việc ép kiểu rồi nhớ
   * mãi rằng chỗ này từng phải ép.
   */
  const bytes = new Uint8Array(data.slice(start, start + entry.compressedSize))

  if (entry.compression === 0) return new TextDecoder().decode(bytes)
  if (entry.compression !== 8) {
    throw new Error(`Mục "${entry.name}" nén bằng phương thức ${entry.compression}, chưa hỗ trợ.`)
  }

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Response(stream).text()
}

/**
 * Đọc .xlsx thành lưới ô, không dùng thư viện ngoài.
 *
 * Chỉ lấy sheet đầu tiên — mọi bản xuất của KiotViet đều một sheet, và bộ nhập
 * của phần mềm này cũng chỉ đọc sheet đầu.
 */
export async function readXlsxMinimal(data: ArrayBuffer): Promise<unknown[][]> {
  const view = new DataView(data)
  const entries = readCentralDirectory(view)

  const sheets = entries
    .filter((e) => /^xl\/worksheets\/[^/]+\.xml$/i.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
  if (sheets.length === 0) throw new Error('Tệp Excel không có trang tính nào.')

  const sharedEntry = entries.find((e) => /^xl\/sharedStrings\.xml$/i.test(e.name))
  const sharedStrings = sharedEntry
    ? parseSharedStrings(await readEntry(data, view, sharedEntry))
    : []

  return parseSheetXml(await readEntry(data, view, sheets[0]), sharedStrings)
}
