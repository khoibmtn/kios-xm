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
 * Trả về câu tiếng Việt nếu nhận ra lỗi, `null` nếu không — người gọi nên ném
 * tiếp để lỗi lạ không bị nuốt mất.
 */
export function describeBookingError(error: unknown): string | null {
  const e = error as PgError
  if (!e || typeof e !== 'object') return null

  if (e.constraint && MESSAGES[e.constraint]) return MESSAGES[e.constraint]

  /*
   * Drizzle không phải lúc nào cũng chuyển tiếp `constraint`; khi đó tên ràng
   * buộc vẫn nằm trong câu thông báo gốc. Dò theo tên còn hơn trả về một câu
   * chung chung không nói lên điều gì.
   */
  if (e.message) {
    for (const [name, message] of Object.entries(MESSAGES)) {
      if (e.message.includes(name)) return message
    }
    if (e.code === '23P01') {
      return 'Khung giờ này đã có lịch khác. Đổi giờ, phòng hoặc kỹ thuật viên.'
    }
  }

  return null
}
