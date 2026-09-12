import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_DURATION_MINUTES,
  formatMinuteOfDay,
  scheduleServices,
  slotsOfDay,
  totalSpanMinutes,
} from './schedule'

const at = (iso: string) => new Date(iso)
const hhmm = (d: Date) => d.toISOString().slice(11, 16)

const svc = (name: string, durationMinutes: number | null) => ({
  serviceId: name,
  serviceName: name,
  durationMinutes,
})

describe('Xếp giờ cho lịch hẹn', () => {
  it('một dịch vụ: kết thúc đúng bằng thời lượng', () => {
    const [slot] = scheduleServices(at('2026-09-12T02:00:00Z'), [svc('Meso', 90)])
    assert.equal(hhmm(slot.startsAt), '02:00')
    assert.equal(hhmm(slot.endsAt), '03:30')
    assert.equal(slot.sortOrder, 0)
  })

  it('hai dịch vụ liên tiếp có buffer chèn ở giữa', () => {
    const slots = scheduleServices(at('2026-09-12T02:00:00Z'), [svc('A', 60), svc('B', 30)], 5)
    assert.equal(hhmm(slots[0].endsAt), '03:00')
    // 5 phút buffer rồi mới tới dịch vụ sau
    assert.equal(hhmm(slots[1].startsAt), '03:05')
    assert.equal(hhmm(slots[1].endsAt), '03:35')
  })

  it('buffer KHÔNG cộng vào cuối dịch vụ cuối cùng', () => {
    // Cộng vào cuối thì khối trên lưới dài hơn thực tế và chiếm chỗ lịch sau.
    const slots = scheduleServices(at('2026-09-12T02:00:00Z'), [svc('A', 60)], 15)
    assert.equal(hhmm(slots[0].endsAt), '03:00')
  })

  it('dịch vụ chưa khai thời lượng thì mặc định một giờ', () => {
    const [a] = scheduleServices(at('2026-09-12T02:00:00Z'), [svc('A', null)])
    assert.equal(a.endsAt.getTime() - a.startsAt.getTime(), DEFAULT_DURATION_MINUTES * 60_000)
  })

  it('thời lượng 0 hoặc âm cũng lùi về mặc định thay vì tạo buổi dài 0 phút', () => {
    // Buổi dài 0 phút sẽ bị ràng buộc `booking_items_time_forward` từ chối ở
    // tầng CSDL — chặn sớm ở đây để lễ tân không gặp lỗi khó hiểu.
    const [a] = scheduleServices(at('2026-09-12T02:00:00Z'), [svc('A', 0)])
    const [b] = scheduleServices(at('2026-09-12T02:00:00Z'), [svc('B', -30)])
    assert.equal(a.endsAt.getTime() - a.startsAt.getTime(), DEFAULT_DURATION_MINUTES * 60_000)
    assert.equal(b.endsAt.getTime() - b.startsAt.getTime(), DEFAULT_DURATION_MINUTES * 60_000)
  })

  it('không có dịch vụ nào thì không sinh mốc nào', () => {
    assert.deepEqual(scheduleServices(at('2026-09-12T02:00:00Z'), []), [])
    assert.equal(totalSpanMinutes([], 5), 0)
  })

  it('tổng thời gian chiếm chỗ đếm buffer đúng n-1 lần', () => {
    assert.equal(totalSpanMinutes([svc('A', 60)], 5), 60)
    assert.equal(totalSpanMinutes([svc('A', 60), svc('B', 30)], 5), 95)
    assert.equal(totalSpanMinutes([svc('A', 60), svc('B', 30), svc('C', 30)], 5), 130)
  })
})

describe('Mốc giờ trong ngày', () => {
  it('bước 30 phút cho ra 48 mốc một ngày', () => {
    assert.equal(slotsOfDay(30).length, 48)
    assert.equal(slotsOfDay(15).length, 96)
    assert.equal(slotsOfDay(60).length, 24)
  })

  it('giới hạn được khoảng giờ', () => {
    const s = slotsOfDay(30, 7 * 60, 9 * 60)
    assert.deepEqual(s.map(formatMinuteOfDay), ['07:00', '07:30', '08:00', '08:30'])
  })

  it('bước 0 hoặc âm lùi về 30 phút thay vì lặp vô hạn', () => {
    assert.equal(slotsOfDay(0).length, 48)
    assert.equal(slotsOfDay(-15).length, 48)
  })

  it('nhãn giờ luôn hai chữ số', () => {
    assert.equal(formatMinuteOfDay(0), '00:00')
    assert.equal(formatMinuteOfDay(545), '09:05')
    assert.equal(formatMinuteOfDay(1439), '23:59')
  })
})
