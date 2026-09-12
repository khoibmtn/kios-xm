import { and, asc, eq, gte, isNull, lt, sql } from 'drizzle-orm'
import { requirePermission } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { bookingItems, bookings, customers, employees, rooms, tenantSettings } from '@/lib/schema'
import { CalendarGrid, type CalendarItem } from './calendar-grid'

export const metadata = { title: 'Lịch hẹn' }
export const dynamic = 'force-dynamic'

/**
 * Spa ở Việt Nam và tuần bắt đầu từ thứ Hai. Mọi phép cắt tuần ở đây dùng
 * **giờ Việt Nam**, không phải giờ máy chủ: Worker chạy ở UTC, nên lấy
 * `getDay()` trên máy chủ sẽ cho ra tuần lệch một ngày với mọi lịch hẹn buổi
 * tối.
 */
const TZ_OFFSET_MINUTES = 7 * 60

/** Đọc `YYYY-MM-DD` thành mốc 00:00 giờ Việt Nam. */
function startOfDayVN(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 0, 0) - TZ_OFFSET_MINUTES * 60_000)
}

function todayInVN(): string {
  const now = new Date(Date.now() + TZ_OFFSET_MINUTES * 60_000)
  return now.toISOString().slice(0, 10)
}

/** Thứ Hai của tuần chứa ngày đó, tính theo giờ Việt Nam. */
function mondayOf(isoDate: string): Date {
  const start = startOfDayVN(isoDate)
  const vnDay = new Date(start.getTime() + TZ_OFFSET_MINUTES * 60_000).getUTCDay()
  const backTo = (vnDay + 6) % 7 // Chủ nhật (0) lùi 6 ngày, thứ Hai (1) lùi 0
  return new Date(start.getTime() - backTo * 86_400_000)
}

export default async function PosCalendarPage({ searchParams }: PageProps<'/pos/calendar'>) {
  const user = await requirePermission('booking.view_own')
  const params = await searchParams

  const rawDate = typeof params.date === 'string' ? params.date : ''
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayInVN()
  const view = params.view === 'day' ? 'day' : 'week'

  const from = view === 'day' ? startOfDayVN(date) : mondayOf(date)
  const to = new Date(from.getTime() + (view === 'day' ? 1 : 7) * 86_400_000)

  const [found, settingsRow] = await Promise.all([
    db
      .select({
        id: bookingItems.id,
        bookingId: bookingItems.bookingId,
        bookingCode: bookings.code,
        serviceName: bookingItems.serviceName,
        startsAt: bookingItems.startsAt,
        endsAt: bookingItems.endsAt,
        status: bookings.status,
        customerName: sql<string>`coalesce(${customers.name}, ${bookings.guestName}, 'Khách lẻ')`,
        customerPhone: sql<string | null>`coalesce(${customers.phone}, ${bookings.guestPhone})`,
        roomName: rooms.name,
        performerName: employees.fullName,
      })
      .from(bookingItems)
      .innerJoin(bookings, eq(bookings.id, bookingItems.bookingId))
      .leftJoin(customers, eq(customers.id, bookings.customerId))
      .leftJoin(rooms, eq(rooms.id, bookingItems.roomId))
      .leftJoin(employees, eq(employees.id, bookingItems.performerEmployeeId))
      .where(
        and(
          eq(bookingItems.tenantId, user.tenantId),
          gte(bookingItems.startsAt, from),
          lt(bookingItems.startsAt, to),
          // Dòng đã huỷ không còn giữ chỗ nên cũng không nên chiếm chỗ trên lưới.
          isNull(bookingItems.cancelledAt),
        ),
      )
      .orderBy(asc(bookingItems.startsAt)),
    db
      .select({ slot: tenantSettings.bookingSlotMinutes })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, user.tenantId)),
  ])

  /*
   * Chuyển `Date` sang chuỗi ISO trước khi truyền xuống client component: đi
   * qua ranh giới server → client, `Date` được serialize rồi dựng lại, và mọi
   * lỗi lệch múi giờ tôi từng gặp đều bắt đầu từ một chỗ như thế này. Chuỗi ISO
   * thì không có gì để hiểu nhầm.
   */
  const items: CalendarItem[] = found.map((r) => ({
    ...r,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
  }))

  return (
    <CalendarGrid
      items={items}
      date={date}
      view={view}
      fromISO={from.toISOString()}
      slotMinutes={settingsRow[0]?.slot ?? 30}
    />
  )
}
