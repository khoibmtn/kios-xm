import {
  check,
  date,
  index,
  integer,
  numeric,
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
import { products } from './catalog'

/**
 * Gói/liệu trình khách đang giữ. Xem `drizzle/0009_customer_packages.sql` để
 * hiểu vì sao chia làm ba bảng.
 *
 * Điều dễ làm sai nhất: **`usedSessions` là cache do trigger ghi**. Muốn đổi số
 * buổi thì chèn một hàng vào `packageTransactions`, đừng UPDATE thẳng
 * (`AGENTS.md` §3b.6). Trigger tính `used = sessions + bonus - SUM(quantity)`,
 * nên một giao dịch `adjust` dương tự động trả buổi lại cho khách.
 */

export const customerPackageStatus = pgEnum('CustomerPackageStatus', [
  'active',
  'used_up',
  'expired',
  'cancelled',
])

export const packageTxnType = pgEnum('PackageTxnType', [
  'grant',
  'use',
  'adjust',
  'expire',
  'cancel',
])

export const customerPackages = pgTable(
  'customer_packages',
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    /** Gói trong danh mục — để trống được nếu gói đã bị xoá khỏi danh mục. */
    packageId: uuid('package_id').references(() => products.id, { onDelete: 'restrict' }),

    code: text().notNull(),
    /** Ảnh chụp tên lúc bán — đổi tên trong danh mục không sửa lại giấy tờ cũ. */
    packageName: text('package_name').notNull(),

    soldAt: date('sold_at').notNull(),
    expiresAt: date('expires_at'),
    /** Tiền khách thật sự trả (`AGENTS.md` §3b.5 — `sale_amount`). */
    price: numeric({ precision: 14, scale: 2 }).notNull().default('0'),

    status: customerPackageStatus().notNull().default('active'),

    /** Khác null nghĩa là chuyển từ phần mềm cũ, không phải bán ở đây. */
    migratedAt: timestamp('migrated_at', { withTimezone: true, mode: 'date' }),
    note: text(),

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
    uniqueIndex('customer_packages_tenant_code_key').on(t.tenantId, t.code),
    index('customer_packages_customer_idx').on(t.customerId, t.status),
    index('customer_packages_tenant_status_idx').on(t.tenantId, t.status),
  ],
)

export const customerPackageItems = pgTable(
  'customer_package_items',
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    customerPackageId: uuid('customer_package_id')
      .notNull()
      .references(() => customerPackages.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id').references(() => products.id, { onDelete: 'restrict' }),
    serviceName: text('service_name').notNull(),

    sessions: integer().notNull(),
    bonusSessions: integer('bonus_sessions').notNull().default(0),

    /** §3b.4 — chốt lúc bán, không tính lại từ bảng giá hiện hành. */
    allocatedPerSession: numeric('allocated_per_session', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),

    /** §3b.6 — CACHE do trigger ghi. Đừng UPDATE thẳng vào đây. */
    usedSessions: integer('used_sessions').notNull().default(0),

    /** Buổi KiotViet đang giữ chỗ cho lịch hẹn lúc chuyển sang — chỉ để tra cứu. */
    migratedReservedSessions: integer('migrated_reserved_sessions').notNull().default(0),

    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    index('customer_package_items_package_idx').on(t.customerPackageId),
    index('customer_package_items_service_idx').on(t.serviceId),
    check('customer_package_items_sessions_positive', sql`${t.sessions} > 0`),
    check('customer_package_items_bonus_not_negative', sql`${t.bonusSessions} >= 0`),
    check(
      'customer_package_items_used_within_bounds',
      sql`${t.usedSessions} >= 0 AND ${t.usedSessions} <= ${t.sessions} + ${t.bonusSessions}`,
    ),
  ],
)

export const packageTransactions = pgTable(
  'package_transactions',
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    customerPackageItemId: uuid('customer_package_item_id')
      .notNull()
      .references(() => customerPackageItems.id, { onDelete: 'cascade' }),

    type: packageTxnType().notNull(),
    /** Có dấu: cấp thì dương, dùng thì âm. Buổi còn lại = SUM(quantity). */
    quantity: integer().notNull(),

    /** §3b.5 — giá trị buổi dùng từ gói. KHÔNG phải doanh thu. */
    allocatedValue: numeric('allocated_value', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),

    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),

    /** §3b.1 — người *làm* là nhân viên, người *bấm nút* là tài khoản. */
    performerEmployeeId: uuid('performer_employee_id').references(() => employees.id, {
      onDelete: 'set null',
    }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    /** Chưa có bảng lịch hẹn/hoá đơn (M2/M3) — để trống, chưa ràng khoá ngoại. */
    bookingItemId: uuid('booking_item_id'),
    invoiceItemId: uuid('invoice_item_id'),

    note: text(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    index('package_transactions_item_idx').on(t.customerPackageItemId, t.occurredAt),
    index('package_transactions_tenant_occurred_idx').on(t.tenantId, t.occurredAt),
    index('package_transactions_performer_idx').on(t.performerEmployeeId, t.occurredAt),
    check(
      'package_transactions_quantity_sign',
      sql`(${t.type} = 'grant' AND ${t.quantity} > 0)
       OR (${t.type} = 'use' AND ${t.quantity} < 0)
       OR (${t.type} = 'expire' AND ${t.quantity} < 0)
       OR (${t.type} = 'cancel' AND ${t.quantity} < 0)
       OR (${t.type} = 'adjust' AND ${t.quantity} <> 0)`,
    ),
    check(
      'package_transactions_adjust_needs_reason',
      sql`${t.type} <> 'adjust' OR (${t.note} IS NOT NULL AND btrim(${t.note}) <> '')`,
    ),
  ],
)
