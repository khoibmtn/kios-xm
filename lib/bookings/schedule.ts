/**
 * Phép tính giờ cho lịch hẹn: xếp các dịch vụ nối tiếp nhau trong một phiếu.
 *
 * Tách ra khỏi server action để kiểm thử được — đây là chỗ dễ sai âm thầm
 * nhất: lệch một buffer thì lịch vẫn lưu được, chỉ là kỹ thuật viên không kịp
 * dọn phòng, và không ai biết cho tới khi khách phàn nàn.
 */

export interface ServiceToSchedule {
  serviceId: string
  serviceName: string
  /** Thời lượng một buổi, phút. Thiếu thì dùng `DEFAULT_DURATION_MINUTES`. */
  durationMinutes?: number | null
  roomId?: string | null
  performerEmployeeId?: string | null
  customerPackageItemId?: string | null
}

export interface ScheduledSlot extends ServiceToSchedule {
  startsAt: Date
  endsAt: Date
  sortOrder: number
}

/** Dịch vụ chưa khai thời lượng thì coi như một giờ, đủ để lễ tân sửa lại. */
export const DEFAULT_DURATION_MINUTES = 60

/**
 * Xếp các dịch vụ nối tiếp từ `startsAt`, chèn `bufferMinutes` **giữa** hai
 * dịch vụ liên tiếp.
 *
 * Buffer nằm giữa chứ không cộng vào cuối dịch vụ cuối cùng: nó là khoảng
 * chuyển tiếp giữa hai việc (`docs/research/04-business-rules.md` §5), không
 * phải phần kéo dài của buổi làm. Cộng vào cuối sẽ khiến khối cuối trên lưới
 * dài hơn thực tế và chiếm chỗ của lịch sau một cách vô cớ.
 */
export function scheduleServices(
  startsAt: Date,
  services: ServiceToSchedule[],
  bufferMinutes = 0,
): ScheduledSlot[] {
  const slots: ScheduledSlot[] = []
  let cursor = startsAt.getTime()

  services.forEach((service, i) => {
    const minutes = normaliseDuration(service.durationMinutes)
    const start = new Date(cursor)
    const end = new Date(cursor + minutes * 60_000)
    slots.push({ ...service, startsAt: start, endsAt: end, sortOrder: i })
    cursor = end.getTime() + bufferMinutes * 60_000
  })

  return slots
}

function normaliseDuration(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value) || value <= 0) return DEFAULT_DURATION_MINUTES
  return Math.round(value)
}

/**
 * Tổng thời gian một phiếu hẹn chiếm chỗ, tính cả buffer ở giữa — dùng để hiện
 * "kết thúc lúc mấy giờ" cho lễ tân trước khi lưu.
 */
export function totalSpanMinutes(services: ServiceToSchedule[], bufferMinutes = 0): number {
  if (services.length === 0) return 0
  const work = services.reduce((sum, s) => sum + normaliseDuration(s.durationMinutes), 0)
  return work + bufferMinutes * (services.length - 1)
}

/**
 * Cắt một ngày thành các mốc giờ đặt được.
 *
 * Trả về mốc theo phút tính từ 00:00 để phía gọi tự ghép với ngày — hàm này
 * không đụng tới múi giờ, và đó là chủ ý: mọi lỗi lệch giờ tôi từng gặp đều
 * đến từ việc một hàm tiện ích âm thầm tự quyết định múi giờ hộ người gọi.
 */
export function slotsOfDay(slotMinutes: number, fromMinute = 0, toMinute = 24 * 60): number[] {
  const step = slotMinutes > 0 ? Math.round(slotMinutes) : 30
  const slots: number[] = []
  for (let m = fromMinute; m < toMinute; m += step) slots.push(m)
  return slots
}

/** 570 → "09:30". Dùng cho nhãn mốc giờ, không phụ thuộc `Date`. */
export function formatMinuteOfDay(minute: number): string {
  const h = Math.floor(minute / 60) % 24
  const m = minute % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
