import { and, asc, eq, gte, isNull, lt, sql } from 'drizzle-orm'
import { requirePermission, can } from '@/lib/auth/session'
import { db } from '@/lib/db'
import {
  bookingCancelReasons,
  bookingItems,
  bookings,
  customers,
  employees,
  products,
  rooms,
  tenantSettings,
} from '@/lib/schema'
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

/**
 * Phút hiện tại tính từ 00:00 giờ Việt Nam.
 *
 * Đọc đồng hồ ngay trong lượt render là đúng ở **server component** có
 * `force-dynamic`: mỗi request dựng lại một lần, và đó chính là điều ta muốn.
 * Điều không được làm là đọc nó phía trình duyệt lúc render — chỗ đó React
 * Compiler chặn có lý, vì hai lượt render liên tiếp sẽ ra hai kết quả khác
 * nhau. Nên con số này tính ở đây rồi gửi xuống.
 */
function nowMinuteInVN(): number {
  const vn = new Date(Date.now() + TZ_OFFSET_MINUTES * 60_000)
  return vn.getUTCHours() * 60 + vn.getUTCMinutes()
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

  const todayISO = todayInVN()
  const nowMinuteVN = nowMinuteInVN()

  const from = view === 'day' ? startOfDayVN(date) : mondayOf(date)
  const to = new Date(from.getTime() + (view === 'day' ? 1 : 7) * 86_400_000)

  const [found, settingsRow, customerList, serviceList, roomList, employeeList, reasonList] =
    await Promise.all([
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
        .select({
          slot: tenantSettings.bookingSlotMinutes,
          buffer: tenantSettings.bookingBufferMinutes,
        })
        .from(tenantSettings)
        .where(eq(tenantSettings.tenantId, user.tenantId)),
      /*
       * Nạp sẵn cả bốn danh sách thay vì tra theo từng lần gõ. Spa này có 81
       * khách, 27 dịch vụ, 1 nhân viên — gửi hết một lần rẻ hơn nhiều so với một
       * vòng mạng cho mỗi ký tự lễ tân gõ vào ô tìm kiếm. Khi số khách lên hàng
       * nghìn thì đổi sang tìm phía máy chủ.
       */
      db
        .select({
          id: customers.id,
          code: customers.code,
          name: customers.name,
          phone: customers.phone,
        })
        .from(customers)
        .where(and(eq(customers.tenantId, user.tenantId), eq(customers.isActive, true)))
        .orderBy(asc(customers.name)),
      db
        .select({
          id: products.id,
          name: products.name,
          durationMinutes: products.durationMinutes,
          basePrice: products.basePrice,
        })
        .from(products)
        .where(
          and(
            eq(products.tenantId, user.tenantId),
            eq(products.kind, 'service'),
            eq(products.isActive, true),
          ),
        )
        .orderBy(asc(products.name)),
      db
        .select({ id: rooms.id, name: rooms.name })
        .from(rooms)
        .where(and(eq(rooms.tenantId, user.tenantId), eq(rooms.isActive, true)))
        .orderBy(asc(rooms.sortOrder), asc(rooms.name)),
      db
        .select({ id: employees.id, name: employees.fullName })
        .from(employees)
        .where(and(eq(employees.tenantId, user.tenantId), eq(employees.status, 'working')))
        .orderBy(asc(employees.fullName)),
      db
        .select({ id: bookingCancelReasons.id, name: bookingCancelReasons.name })
        .from(bookingCancelReasons)
        .where(
          and(
            eq(bookingCancelReasons.tenantId, user.tenantId),
            eq(bookingCancelReasons.isActive, true),
          ),
        )
        .orderBy(asc(bookingCancelReasons.sortOrder)),
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
      canBook={can(user, 'booking.manage')}
      todayISO={todayISO}
      nowMinute={nowMinuteVN}
      cancelReasons={reasonList}
      options={{
        customers: customerList,
        services: serviceList,
        rooms: roomList,
        employees: employeeList,
        bufferMinutes: settingsRow[0]?.buffer ?? 0,
        slotMinutes: settingsRow[0]?.slot ?? 30,
      }}
    />
  )
}
