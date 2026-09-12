'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { assertPermission, ForbiddenError } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { bookingItems, bookings, customers, products, tenantSettings } from '@/lib/schema'
import { writeAudit } from '@/lib/audit'
import { describeBookingError } from '@/lib/bookings/conflicts'
import { scheduleServices, type ServiceToSchedule } from '@/lib/bookings/schedule'

export interface CreateBookingInput {
  /** Một trong hai: hồ sơ khách, hoặc tên khách vãng lai. */
  customerId?: string
  guestName?: string
  guestPhone?: string
  /** Giờ bắt đầu dịch vụ đầu tiên, dạng ISO. */
  startsAt: string
  note?: string
  services: {
    serviceId: string
    roomId?: string
    performerEmployeeId?: string
    customerPackageItemId?: string
  }[]
}

export interface BookingResult {
  ok: boolean
  bookingId?: string
  code?: string
  error?: string
}

/**
 * Tạo một lịch hẹn.
 *
 * Không kiểm tra trùng giờ bằng SELECT trước: hai lễ tân cùng đặt một phòng
 * trong cùng một giây là chuyện có thật ở quầy, và mọi phép kiểm "đọc rồi ghi"
 * đều có khe hở giữa hai câu lệnh. Cứ chèn, để hai ràng buộc `EXCLUDE` của
 * cơ sở dữ liệu từ chối, rồi dịch lỗi sang tiếng Việt
 * (`lib/bookings/conflicts.ts`).
 */
export async function createBookingAction(input: CreateBookingInput): Promise<BookingResult> {
  let user
  try {
    user = await assertPermission('booking.manage')
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'Bạn không có quyền đặt lịch.' }
    throw e
  }

  if (input.services.length === 0) {
    return { ok: false, error: 'Lịch hẹn phải có ít nhất một dịch vụ.' }
  }
  if (!input.customerId && !input.guestName?.trim()) {
    return { ok: false, error: 'Chọn hồ sơ khách hoặc nhập tên khách vãng lai.' }
  }

  const startsAt = new Date(input.startsAt)
  if (Number.isNaN(startsAt.getTime())) {
    return { ok: false, error: 'Giờ bắt đầu không hợp lệ.' }
  }

  try {
    const serviceIds = [...new Set(input.services.map((s) => s.serviceId))]

    const [found, settingsRow, customerRow] = await Promise.all([
      db
        .select({
          id: products.id,
          name: products.name,
          kind: products.kind,
          durationMinutes: products.durationMinutes,
        })
        .from(products)
        .where(and(eq(products.tenantId, user.tenantId), inArray(products.id, serviceIds))),
      db
        .select({ buffer: tenantSettings.bookingBufferMinutes })
        .from(tenantSettings)
        .where(eq(tenantSettings.tenantId, user.tenantId)),
      input.customerId
        ? db
            .select({ id: customers.id })
            .from(customers)
            .where(and(eq(customers.tenantId, user.tenantId), eq(customers.id, input.customerId)))
        : Promise.resolve([]),
    ])

    if (input.customerId && customerRow.length === 0) {
      return { ok: false, error: 'Không tìm thấy hồ sơ khách hàng.' }
    }

    const byId = new Map(found.map((p) => [p.id, p]))
    const missing = serviceIds.filter((id) => !byId.has(id))
    if (missing.length > 0) return { ok: false, error: 'Có dịch vụ không còn trong danh mục.' }

    const notService = found.filter((p) => p.kind !== 'service')
    if (notService.length > 0) {
      return {
        ok: false,
        error: `"${notService[0].name}" không phải dịch vụ nên không đặt lịch được.`,
      }
    }

    const toSchedule: ServiceToSchedule[] = input.services.map((s) => {
      const p = byId.get(s.serviceId)!
      return {
        serviceId: s.serviceId,
        serviceName: p.name,
        durationMinutes: p.durationMinutes,
        roomId: s.roomId ?? null,
        performerEmployeeId: s.performerEmployeeId ?? null,
        customerPackageItemId: s.customerPackageItemId ?? null,
      }
    })

    const slots = scheduleServices(startsAt, toSchedule, settingsRow[0]?.buffer ?? 0)

    /*
     * Mã lịch hẹn sinh từ mã lớn nhất hiện có. UNIQUE (tenant_id, code) mới là
     * thứ chặn trùng thật sự — nếu hai người đặt cùng lúc thì người thứ hai
     * nhận lỗi và bấm lại, chứ không ghi đè lên nhau.
     */
    const [maxRow] = await db
      .select({ code: sql<string>`max(${bookings.code})` })
      .from(bookings)
      .where(eq(bookings.tenantId, user.tenantId))
    const next = Number.parseInt((maxRow?.code ?? '').replace(/\D/g, ''), 10)
    const code = `LH${String(Number.isFinite(next) ? next + 1 : 1).padStart(6, '0')}`

    /*
     * Phiếu hẹn và các dòng dịch vụ phải nằm trong **một giao dịch**.
     *
     * Không có nó thì một lần đặt trùng giờ để lại một phiếu hẹn rỗng: dòng
     * dịch vụ bị ràng buộc `EXCLUDE` từ chối, nhưng phiếu đã ghi xong rồi.
     * Phiếu rỗng không hiện trên lưới (lưới đi từ `booking_items`) nên nó nằm
     * đó vô hình, ăn mất một mã LH và làm bảng đầy rác. Phát hiện được vì lúc
     * dọn dữ liệu thử thấy xoá ra **ba** phiếu trong khi chỉ đặt thành công
     * một.
     *
     * Bên trong phải dùng `tx`, tuyệt đối không chạm `db` toàn cục: mỗi request
     * chỉ có **một** kết nối (`lib/db.ts`), gọi `db` trong giao dịch đang mở là
     * tự khoá chính mình.
     */
    const booking = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(bookings)
        .values({
          tenantId: user.tenantId,
          branchId: user.branchId,
          customerId: input.customerId ?? null,
          guestName: input.guestName?.trim() || null,
          guestPhone: input.guestPhone?.trim() || null,
          code,
          note: input.note?.trim() || null,
          createdByUserId: user.id,
        })
        .returning({ id: bookings.id, code: bookings.code })

      await tx.insert(bookingItems).values(
        slots.map((s) => ({
          bookingId: created.id,
          tenantId: user.tenantId,
          serviceId: s.serviceId,
          serviceName: s.serviceName,
          roomId: s.roomId ?? null,
          performerEmployeeId: s.performerEmployeeId ?? null,
          customerPackageItemId: s.customerPackageItemId ?? null,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          sortOrder: s.sortOrder,
        })),
      )

      return created
    })

    await writeAudit({
      tenantId: user.tenantId,
      userId: user.id,
      entity: 'booking',
      entityId: booking.id,
      action: 'create',
      after: { code: booking.code, services: slots.length, startsAt: input.startsAt },
      reason: `Đặt lịch ${booking.code}`,
    })
    revalidatePath('/pos/calendar')

    return { ok: true, bookingId: booking.id, code: booking.code }
  } catch (e) {
    const friendly = describeBookingError(e)
    if (friendly) return { ok: false, error: friendly }
    console.error('[createBookingAction]', e instanceof Error ? e.message : String(e))
    return { ok: false, error: 'Không lưu được lịch hẹn. Chi tiết đã được ghi lại.' }
  }
}

/**
 * Huỷ cả phiếu hẹn. Trigger `bookings_cascade_cancel` tự huỷ các dòng dịch vụ
 * bên trong và nhả chỗ phòng ra ngay — không cần mã ứng dụng nhớ việc đó.
 */
export async function cancelBookingAction(
  bookingId: string,
  reasonId: string | null,
  note: string,
): Promise<BookingResult> {
  let user
  try {
    user = await assertPermission('booking.manage')
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'Bạn không có quyền huỷ lịch.' }
    throw e
  }

  if (!reasonId && !note.trim()) {
    return { ok: false, error: 'Chọn lý do huỷ hoặc ghi rõ lý do.' }
  }

  try {
    const updated = await db
      .update(bookings)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelReasonId: reasonId,
        cancelNote: note.trim() || null,
      })
      .where(and(eq(bookings.tenantId, user.tenantId), eq(bookings.id, bookingId)))
      .returning({ code: bookings.code })

    if (updated.length === 0) return { ok: false, error: 'Không tìm thấy lịch hẹn.' }

    await writeAudit({
      tenantId: user.tenantId,
      userId: user.id,
      entity: 'booking',
      entityId: bookingId,
      action: 'update',
      after: { status: 'cancelled', reasonId, note },
      reason: `Huỷ lịch ${updated[0].code}: ${note.trim() || 'theo lý do đã chọn'}`,
    })
    revalidatePath('/pos/calendar')

    return { ok: true, code: updated[0].code }
  } catch (e) {
    const friendly = describeBookingError(e)
    if (friendly) return { ok: false, error: friendly }
    console.error('[cancelBookingAction]', e instanceof Error ? e.message : String(e))
    return { ok: false, error: 'Không huỷ được lịch hẹn. Chi tiết đã được ghi lại.' }
  }
}

/**
 * Đổi trạng thái phiếu hẹn — "khách đã tới", "đang làm", "hoàn thành"…
 *
 * Không nhận `cancelled` ở đây: huỷ là việc khác, bắt buộc có lý do, và đi qua
 * `cancelBookingAction`. Gộp hai thứ vào một hàm thì sớm muộn cũng có chỗ gọi
 * quên truyền lý do rồi bị ràng buộc `bookings_cancel_needs_reason` từ chối
 * bằng một lỗi khó hiểu.
 */
export async function setBookingStatusAction(
  bookingId: string,
  status: 'scheduled' | 'confirmed' | 'arrived' | 'in_progress' | 'done' | 'no_show',
): Promise<BookingResult> {
  let user
  try {
    user = await assertPermission('booking.manage')
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'Bạn không có quyền sửa lịch.' }
    throw e
  }

  try {
    const updated = await db
      .update(bookings)
      .set({ status })
      .where(and(eq(bookings.tenantId, user.tenantId), eq(bookings.id, bookingId)))
      .returning({ code: bookings.code })

    if (updated.length === 0) return { ok: false, error: 'Không tìm thấy lịch hẹn.' }

    await writeAudit({
      tenantId: user.tenantId,
      userId: user.id,
      entity: 'booking',
      entityId: bookingId,
      action: 'update',
      after: { status },
      reason: `Đổi trạng thái lịch ${updated[0].code} → ${status}`,
    })
    revalidatePath('/pos/calendar')
    return { ok: true, code: updated[0].code }
  } catch (e) {
    const friendly = describeBookingError(e)
    if (friendly) return { ok: false, error: friendly }
    console.error('[setBookingStatusAction]', e instanceof Error ? e.message : String(e))
    return { ok: false, error: 'Không đổi được trạng thái. Chi tiết đã được ghi lại.' }
  }
}

/**
 * Dời một dòng dịch vụ sang giờ khác, giữ nguyên thời lượng — dùng cho kéo–thả
 * trên lưới.
 *
 * Thời lượng suy từ chính dòng đang có chứ không tính lại từ danh mục: dịch vụ
 * có thể đã đổi thời lượng kể từ lúc đặt, mà khách thì được hẹn theo giờ cũ.
 */
export async function moveBookingItemAction(
  bookingItemId: string,
  startsAt: string,
): Promise<BookingResult> {
  let user
  try {
    user = await assertPermission('booking.manage')
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'Bạn không có quyền sửa lịch.' }
    throw e
  }

  const start = new Date(startsAt)
  if (Number.isNaN(start.getTime())) return { ok: false, error: 'Giờ mới không hợp lệ.' }

  try {
    const [current] = await db
      .select({ startsAt: bookingItems.startsAt, endsAt: bookingItems.endsAt })
      .from(bookingItems)
      .where(and(eq(bookingItems.tenantId, user.tenantId), eq(bookingItems.id, bookingItemId)))

    if (!current) return { ok: false, error: 'Không tìm thấy dòng dịch vụ.' }

    const durationMs = current.endsAt.getTime() - current.startsAt.getTime()
    await db
      .update(bookingItems)
      .set({ startsAt: start, endsAt: new Date(start.getTime() + durationMs) })
      .where(and(eq(bookingItems.tenantId, user.tenantId), eq(bookingItems.id, bookingItemId)))

    await writeAudit({
      tenantId: user.tenantId,
      userId: user.id,
      entity: 'booking_item',
      entityId: bookingItemId,
      action: 'update',
      before: { startsAt: current.startsAt.toISOString() },
      after: { startsAt: start.toISOString() },
      reason: 'Kéo đổi giờ trên lưới lịch hẹn',
    })
    revalidatePath('/pos/calendar')
    return { ok: true }
  } catch (e) {
    const friendly = describeBookingError(e)
    if (friendly) return { ok: false, error: friendly }
    console.error('[moveBookingItemAction]', e instanceof Error ? e.message : String(e))
    return { ok: false, error: 'Không dời được lịch. Chi tiết đã được ghi lại.' }
  }
}
