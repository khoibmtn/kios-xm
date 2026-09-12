import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { describeBookingError } from './conflicts'

/**
 * Hình dạng lỗi dưới đây chép đúng thứ Drizzle ném ra trên bản triển khai
 * (đã in ra để xem), không phải lỗi tôi tưởng tượng — đó là điểm khiến bài
 * kiểm này có giá trị.
 */
const drizzleWrapped = (inner: Record<string, unknown>) =>
  Object.assign(new Error('Failed query: insert into "booking_items" ("id", …)'), {
    cause: Object.assign(new Error(String(inner.message ?? 'db error')), inner),
  })

describe('Dịch lỗi ràng buộc lịch hẹn', () => {
  it('đọc được tên ràng buộc nằm trong cause của Drizzle', () => {
    const e = drizzleWrapped({
      code: '23P01',
      constraint: 'booking_items_no_performer_overlap',
      message: 'conflicting key value violates exclusion constraint',
    })
    assert.match(describeBookingError(e) ?? '', /Kỹ thuật viên này đã có lịch khác/)
  })

  it('nhận ra trùng phòng', () => {
    const e = drizzleWrapped({ code: '23P01', constraint: 'booking_items_no_room_overlap' })
    assert.match(describeBookingError(e) ?? '', /Phòng này đã có lịch khác/)
  })

  it('lỗi pg không bọc cũng đọc được', () => {
    assert.match(
      describeBookingError({ code: '23P01', constraint: 'booking_items_no_room_overlap' }) ?? '',
      /Phòng này đã có lịch khác/,
    )
  })

  it('không có tên ràng buộc thì vẫn nhận ra 23P01 và nói được đại ý', () => {
    const e = drizzleWrapped({ code: '23P01' })
    assert.match(describeBookingError(e) ?? '', /Khung giờ này đã có lịch khác/)
  })

  it('dò được tên ràng buộc nằm trong câu thông báo', () => {
    const e = drizzleWrapped({
      code: '23514',
      message: 'new row violates check constraint "booking_items_time_forward"',
    })
    assert.match(describeBookingError(e) ?? '', /Giờ kết thúc phải sau giờ bắt đầu/)
  })

  it('lỗi lạ trả về null để người gọi ghi lại thay vì nuốt mất', () => {
    assert.equal(describeBookingError(new Error('mạng hỏng')), null)
    assert.equal(describeBookingError(null), null)
    assert.equal(describeBookingError('chuỗi'), null)
  })

  it('không lặp vô hạn khi cause trỏ vòng về chính nó', () => {
    const e: Record<string, unknown> = { message: 'vòng' }
    e.cause = e
    assert.equal(describeBookingError(e), null)
  })
})
