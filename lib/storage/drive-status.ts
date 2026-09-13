/**
 * Đánh giá sức khoẻ của việc sao lưu, để màn hình Tổng quan nói được một câu
 * thẳng thắn thay vì bày ra mấy con số rồi để người đọc tự suy.
 *
 * Viết ra sau sự cố đêm 12→13/09: job sao lưu hỏng và **không ai biết** cho
 * tới khi GitHub gửi email báo lỗi. Ứng dụng lúc đó không có chỗ nào trả lời
 * được câu "lần cuối sao lưu được là bao giờ". Một bản sao lưu mà không ai
 * nhìn thấy trạng thái thì hỏng lúc nào cũng được, miễn đừng ai kiểm tra.
 *
 * Hàm thuần, không chạm cơ sở dữ liệu, nhận cả `now` — để kiểm thử được mọi
 * mốc thời gian mà không phải chờ bảy ngày.
 */

/** Ở chế độ Testing của Google, refresh token hết hạn sau 7 ngày (ADR-002 §2.6). */
export const TESTING_TOKEN_LIFETIME_DAYS = 7

/** Dưới ngưỡng này thì nhắc trước, để còn kịp bấm kết nối lại. */
const WARN_BEFORE_EXPIRY_DAYS = 2

/** Sao lưu chạy hằng đêm; quá hai đêm không có bản nào là đã hỏng thật. */
const BACKUP_STALE_DAYS = 2

const DAY = 86_400_000

export type DriveLevel = 'ok' | 'warn' | 'error'

export interface DriveStatus {
  level: DriveLevel
  /** Câu kết luận, đọc một dòng là hiểu. */
  headline: string
  /** Giải thích vì sao. */
  detail: string
  /** Việc cần làm, bỏ trống nếu không phải làm gì. */
  action?: string
  /** Số ngày còn lại của kết nối; `null` khi app đã publish (không hết hạn). */
  expiresInDays: number | null
  /** Bản sao lưu gần nhất cách đây bao nhiêu ngày; `null` nếu chưa có bản nào. */
  backupAgeDays: number | null
}

export interface DriveStatusInput {
  connectedAt: Date | null
  connectedEmail: string | null
  lastBackupAt: Date | null
  /**
   * OAuth app đã chuyển sang "In production" chưa. Khi chưa, refresh token hết
   * hạn 7 ngày một lần và phải bấm kết nối lại.
   */
  oauthPublished: boolean
  now?: Date
}

const daysBetween = (later: number, earlier: number) => (later - earlier) / DAY

export function assessDrive(input: DriveStatusInput): DriveStatus {
  const now = (input.now ?? new Date()).getTime()

  const expiresInDays =
    input.oauthPublished || !input.connectedAt
      ? null
      : TESTING_TOKEN_LIFETIME_DAYS - daysBetween(now, input.connectedAt.getTime())

  const backupAgeDays = input.lastBackupAt
    ? daysBetween(now, input.lastBackupAt.getTime())
    : null

  const base = { expiresInDays, backupAgeDays }

  // Thứ tự dưới đây là thứ tự mức độ khẩn — cái nào đang gây thiệt hại thật
  // thì nói trước, cái nào mới là dự báo thì nói sau.

  if (!input.connectedAt) {
    return {
      ...base,
      level: 'error',
      headline: 'Chưa kết nối Google Drive',
      detail: 'Không có nơi cất bản sao lưu, nên sao lưu hằng đêm không chạy.',
      action: 'Vào Thiết lập → Lưu trữ để kết nối.',
    }
  }

  if (expiresInDays !== null && expiresInDays <= 0) {
    return {
      ...base,
      level: 'error',
      headline: 'Kết nối Google Drive đã hết hạn',
      detail:
        'Sao lưu hằng đêm đang dừng. Google cho phép kết nối 7 ngày mỗi lần khi ứng dụng ' +
        'chưa được xét duyệt.',
      action: 'Bấm "Kết nối lại" ở Thiết lập → Lưu trữ. Một lần bấm là cả sao lưu cũng chạy lại.',
    }
  }

  if (backupAgeDays !== null && backupAgeDays > BACKUP_STALE_DAYS) {
    return {
      ...base,
      level: 'error',
      headline: `Đã ${Math.floor(backupAgeDays)} ngày không có bản sao lưu nào`,
      detail: 'Sao lưu chạy hằng đêm lúc 02:00. Quá hai đêm không có bản mới nghĩa là nó đang hỏng.',
      action: 'Kiểm tra kết nối Drive; nếu vẫn còn hạn thì xem log GitHub Actions.',
    }
  }

  if (backupAgeDays === null) {
    return {
      ...base,
      level: 'warn',
      headline: 'Chưa có bản sao lưu nào',
      detail: 'Kết nối đã có nhưng chưa lần nào sao lưu xong. Lượt đầu chạy lúc 02:00 đêm nay.',
    }
  }

  if (expiresInDays !== null && expiresInDays <= WARN_BEFORE_EXPIRY_DAYS) {
    const con = Math.max(0, Math.floor(expiresInDays))
    return {
      ...base,
      level: 'warn',
      headline:
        con === 0
          ? 'Kết nối Google Drive hết hạn trong hôm nay'
          : `Kết nối Google Drive còn ${con} ngày`,
      detail: 'Hết hạn thì sao lưu hằng đêm dừng lại mà không báo gì thêm.',
      action: 'Bấm "Kết nối lại" ở Thiết lập → Lưu trữ ngay bây giờ cho chắc.',
    }
  }

  return {
    ...base,
    level: 'ok',
    headline: 'Sao lưu đang chạy bình thường',
    detail: input.connectedEmail
      ? `Đang cất vào Google Drive của ${input.connectedEmail}.`
      : 'Đang cất vào Google Drive.',
  }
}
