import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { branches, employees, tenants, users } from './index'
import { customers } from './customers'
import { customerPackageItems } from './customer-packages'
import { products } from './catalog'
import { rooms } from './rooms'

/**
 * Lịch hẹn. Xem `drizzle/0011_bookings.sql` để hiểu vì sao chống trùng lịch
 * nằm ở tầng cơ sở dữ liệu.
 *
 * Hai điều dễ làm sai nhất:
 *
 * 1. **Thời gian và phòng có nguồn sự thật ở `bookingItems`**, không phải ở hoá
 *    đơn (`AGENTS.md` §3b.2). Mỗi dịch vụ luôn có một dòng ở đây, kể cả khách
 *    vãng lai làm ngay.
 * 2. Hai ràng buộc `EXCLUDE` chống đặt trùng phòng và trùng nhân viên **không
 *    hiện ra trong kiểu TypeScript**. Chèn chồng giờ sẽ ném lỗi lúc chạy với
 *    SQLSTATE 23P01 — bắt lấy và dịch sang câu tiếng Việt, đừng để lỗi thô lên
 *    màn hình.
 */

export const bookingStatus = pgEnum('BookingStatus', [
  'scheduled',
  'confirmed',
  'arrived',
  'in_progress',
  'done',
  'cancelled',
  'no_show',
])

export const BOOKING_STATUS_LABEL: Record<string, string> = {
  scheduled: 'Chưa tới',
  confirmed: 'Đã xác nhận',
  arrived: 'Khách đã tới',
  in_progress: 'Đang làm',
  done: 'Hoàn thành',
  cancelled: 'Đã huỷ',
  no_show: 'Khách không tới',
}

export const bookingCancelReasons = pgTable(
  'booking_cancel_reasons',
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('booking_cancel_reasons_tenant_name_key').on(t.tenantId, t.name)],
)

export const bookings = pgTable(
  'bookings',
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),

    /** Khách có hồ sơ; để trống thì phải có `guestName`. */
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'restrict' }),
    guestName: text('guest_name'),
    guestPhone: text('guest_phone'),

    code: text().notNull(),
    status: bookingStatus().notNull().default('scheduled'),
    note: text(),
    /** `staff` đặt ở quầy, `online` khách tự đặt (M9). */
    source: text().notNull().default('staff'),

    cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'date' }),
    cancelReasonId: uuid('cancel_reason_id').references(() => bookingCancelReasons.id, {
      onDelete: 'set null',
    }),
    cancelNote: text('cancel_note'),

    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('bookings_tenant_code_key').on(t.tenantId, t.code),
    index('bookings_customer_idx').on(t.customerId),
    index('bookings_branch_status_idx').on(t.branchId, t.status),
    check(
      'bookings_has_someone',
      sql`${t.customerId} IS NOT NULL OR (${t.guestName} IS NOT NULL AND btrim(${t.guestName}) <> '')`,
    ),
    check(
      'bookings_cancel_needs_reason',
      sql`${t.status} <> 'cancelled'
       OR (${t.cancelledAt} IS NOT NULL
           AND (${t.cancelReasonId} IS NOT NULL
                OR (${t.cancelNote} IS NOT NULL AND btrim(${t.cancelNote}) <> '')))`,
    ),
  ],
)

export const bookingItems = pgTable(
  'booking_items',
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    serviceId: uuid('service_id').references(() => products.id, { onDelete: 'restrict' }),
    /** Ảnh chụp tên lúc đặt — đổi tên dịch vụ không sửa lại lịch sử. */
    serviceName: text('service_name').notNull(),

    roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'set null' }),
    performerEmployeeId: uuid('performer_employee_id').references(() => employees.id, {
      onDelete: 'set null',
    }),

    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true, mode: 'date' }).notNull(),

    /** Buổi trừ từ gói khách đang giữ, nếu có. */
    customerPackageItemId: uuid('customer_package_item_id').references(
      () => customerPackageItems.id,
      { onDelete: 'set null' },
    ),

    /** Dòng đã huỷ nhả chỗ ngay — hai ràng buộc EXCLUDE bỏ qua nó. */
    cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'date' }),
    cancelReasonId: uuid('cancel_reason_id').references(() => bookingCancelReasons.id, {
      onDelete: 'set null',
    }),
    cancelNote: text('cancel_note'),

    note: text(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    index('booking_items_booking_idx').on(t.bookingId),
    index('booking_items_time_idx').on(t.tenantId, t.startsAt),
    index('booking_items_room_idx').on(t.roomId, t.startsAt),
    index('booking_items_performer_idx').on(t.performerEmployeeId, t.startsAt),
    check('booking_items_time_forward', sql`${t.endsAt} > ${t.startsAt}`),
    check(
      'booking_items_time_sane',
      sql`${t.endsAt} - ${t.startsAt} <= interval '12 hours'`,
    ),
  ],
)
