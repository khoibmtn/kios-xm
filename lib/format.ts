/**
 * Định dạng hiển thị cho người Việt.
 *
 * Nguyên tắc: tiền lưu dạng `numeric` trong cơ sở dữ liệu (chuỗi khi đọc ra),
 * thời gian lưu `timestamptz` theo UTC. Mọi chuyển đổi sang cách đọc của người
 * dùng đều đi qua tệp này — không tự gọi `toLocaleString` rải rác trong giao diện.
 */

const TZ = 'Asia/Ho_Chi_Minh'
const LOCALE = 'vi-VN'

// Tạo sẵn để dùng lại; khởi tạo Intl mỗi lần gọi khá tốn khi vẽ bảng nghìn dòng.
const moneyFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 })
const decimalFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 3 })
const percentFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 })

type Numeric = number | string | null | undefined

function toNumber(v: Numeric): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isFinite(n) ? n : null
}

/**
 * Tiền Việt: `1500000` → `1.500.000`.
 * Không kèm chữ "đ" — để nơi gọi tự quyết định, vì trong bảng thường bỏ đơn vị
 * cho gọn còn ở tổng kết thì cần.
 */
export function formatMoney(value: Numeric): string {
  const n = toNumber(value)
  return n === null ? '' : moneyFmt.format(n)
}

/** Tiền kèm đơn vị: `1500000` → `1.500.000 đ`. */
export function formatMoneyWithUnit(value: Numeric): string {
  const s = formatMoney(value)
  return s === '' ? '' : `${s} đ`
}

/** Số lượng, cho phép lẻ tới 3 chữ số (ví dụ 0,5 buổi hay 1,25 ml). */
export function formatQuantity(value: Numeric): string {
  const n = toNumber(value)
  return n === null ? '' : decimalFmt.format(n)
}

/** Phần trăm: `12.5` → `12,5%`. */
export function formatPercent(value: Numeric): string {
  const n = toNumber(value)
  return n === null ? '' : `${percentFmt.format(n)}%`
}

/**
 * Thời lượng dịch vụ tính bằng phút → cách nói của người Việt.
 * `90` → `1h30'` · `60` → `1h` · `45` → `45'`
 */
export function formatDuration(minutes: Numeric): string {
  const n = toNumber(minutes)
  if (n === null || n <= 0) return ''
  const h = Math.floor(n / 60)
  const m = Math.round(n % 60)
  if (h === 0) return `${m}'`
  if (m === 0) return `${h}h`
  return `${h}h${String(m).padStart(2, '0')}'`
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** `05/09/2026` */
export function formatDate(value: Date | string | null | undefined): string {
  const d = toDate(value)
  return d
    ? new Intl.DateTimeFormat(LOCALE, { dateStyle: 'short', timeZone: TZ }).format(d)
    : ''
}

/** `05/09/2026 14:30` */
export function formatDateTime(value: Date | string | null | undefined): string {
  const d = toDate(value)
  return d
    ? new Intl.DateTimeFormat(LOCALE, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: TZ,
      }).format(d)
    : ''
}

/** `14:30` — dùng trong lưới lịch hẹn. */
export function formatTime(value: Date | string | null | undefined): string {
  const d = toDate(value)
  return d
    ? new Intl.DateTimeFormat(LOCALE, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: TZ,
      }).format(d)
    : ''
}

/** `Thứ Bảy, 05/09` — tiêu đề cột trong lưới lịch hẹn. */
export function formatWeekdayDate(value: Date | string | null | undefined): string {
  const d = toDate(value)
  if (!d) return ''
  const weekday = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', timeZone: TZ }).format(d)
  const dayMonth = new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit',
    month: '2-digit',
    timeZone: TZ,
  }).format(d)
  // Intl trả "Thứ Bảy" nhưng "Chủ Nhật" thì đúng rồi; viết hoa chữ đầu cho đồng nhất.
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${dayMonth}`
}

/** Khoảng cách thời gian dễ đọc: `3 phút trước`, `2 ngày trước`. */
export function formatRelative(value: Date | string | null | undefined): string {
  const d = toDate(value)
  if (!d) return ''

  const diffSec = Math.round((d.getTime() - Date.now()) / 1000)
  const abs = Math.abs(diffSec)
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' })

  if (abs < 60) return rtf.format(Math.round(diffSec), 'second')
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour')
  if (abs < 2592000) return rtf.format(Math.round(diffSec / 86400), 'day')
  if (abs < 31536000) return rtf.format(Math.round(diffSec / 2592000), 'month')
  return rtf.format(Math.round(diffSec / 31536000), 'year')
}

/** Số điện thoại Việt Nam: `0988338699` → `0988 338 699`. */
export function formatPhone(value: string | null | undefined): string {
  if (!value) return ''
  const digits = value.replace(/\D/g, '')
  if (digits.length === 10) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
  }
  if (digits.length === 11) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8)}`
  }
  return value
}

/**
 * Bỏ dấu tiếng Việt để tìm kiếm — gõ "meso" phải ra "Mesô", gõ "goi" ra "gói".
 */
export function removeDiacritics(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
}

/** So khớp không phân biệt hoa thường và dấu. */
export function matchesSearch(haystack: string, needle: string): boolean {
  if (!needle) return true
  return removeDiacritics(haystack.toLowerCase()).includes(
    removeDiacritics(needle.toLowerCase()),
  )
}
