/**
 * Dịch lỗi ràng buộc của Postgres thành câu người ở quầy đọc được.
 *
 * Chống trùng lịch nằm ở tầng cơ sở dữ liệu (`drizzle/0011_bookings.sql`), nên
 * lúc hai lễ tân cùng đặt một phòng, người thứ hai nhận về một `DatabaseError`
 * với SQLSTATE 23P01 và một câu tiếng Anh có kèm tên ràng buộc. Chuỗi đó không
 * giúp được ai đang đứng trước mặt khách.
 *
 * Đây cũng là lý do **không** kiểm tra trùng giờ bằng SELECT trước rồi INSERT
 * sau: giữa hai câu lệnh luôn có khe hở, và ở quầy lễ tân khe hở đó xảy ra
 * thật. Cứ chèn, rồi dịch lỗi nếu bị từ chối.
 */

/** 23P01 = exclusion_violation, 23505 = unique_violation, 23514 = check_violation */
interface PgError {
  code?: string
  constraint?: string
  message?: string
}

const MESSAGES: Record<string, string> = {
  booking_items_no_room_overlap:
    'Phòng này đã có lịch khác trong khung giờ vừa chọn. Chọn phòng khác hoặc đổi giờ.',
  booking_items_no_performer_overlap:
    'Kỹ thuật viên này đã có lịch khác trong khung giờ vừa chọn. Chọn người khác hoặc đổi giờ.',
  booking_items_time_forward: 'Giờ kết thúc phải sau giờ bắt đầu.',
  booking_items_time_sane: 'Một buổi không thể kéo dài quá 12 tiếng — kiểm tra lại ngày giờ.',
  bookings_has_someone: 'Lịch hẹn phải có khách: chọn hồ sơ khách hoặc nhập tên khách vãng lai.',
  bookings_cancel_needs_reason: 'Huỷ lịch thì phải chọn lý do hoặc ghi rõ lý do.',
  bookings_tenant_code_key: 'Mã lịch hẹn này đã tồn tại, thử lại lần nữa.',
}

/**
 * Trả về câu tiếng Việt nếu nhận ra lỗi, `null` nếu không — người gọi nên ghi
 * lại lỗi lạ thay vì nuốt mất.
 *
 * Phải đi dọc chuỗi `cause`: Drizzle **bọc** lỗi của `pg` lại, và lớp ngoài chỉ
 * có `message` dạng "Failed query: insert into …" — không `code`, không
 * `constraint`. Mã 23P01 và tên ràng buộc nằm ở `cause`. Bản đầu tiên của hàm
 * này chỉ đọc lớp ngoài, nên mọi lần đặt trùng giờ đều rơi xuống câu chung
 * chung; chỉ lộ ra khi bấm thử thật trên bản triển khai.
 *
 * Tiện thể: `message` của lớp ngoài chứa **nguyên câu lệnh và toàn bộ tham số**
 * (xem `PROGRESS.md` 05/09) — thêm một lý do để không bao giờ đưa nó lên màn
 * hình.
 */
export function describeBookingError(error: unknown): string | null {
  let current: unknown = error

  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth++) {
    const e = current as PgError & { cause?: unknown }

    if (e.constraint && MESSAGES[e.constraint]) return MESSAGES[e.constraint]

    if (e.message) {
      for (const [name, message] of Object.entries(MESSAGES)) {
        if (e.message.includes(name)) return message
      }
    }
    if (e.code === '23P01') {
      return 'Khung giờ này đã có lịch khác. Đổi giờ, phòng hoặc kỹ thuật viên.'
    }

    current = e.cause
  }

  return null
}
