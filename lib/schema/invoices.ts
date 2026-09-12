import {
  boolean,
  check,
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
import { customerPackageItems } from './customer-packages'
import { bookingItems } from './bookings'
import { priceBooks, products } from './catalog'

/**
 * Hoá đơn, thanh toán, sổ quỹ. Xem `drizzle/0012_invoices.sql`.
 *
 * Ba điều dễ làm sai nhất:
 *
 * 1. **`invoices.total` mới là doanh thu.** `serviceAllocatedValue` là giá trị
 *    buổi khách dùng từ gói — tiền đã thu từ hôm bán gói, cộng vào doanh thu
 *    là đếm hai lần (`AGENTS.md` §3b.5).
 * 2. **`paidAmount` và `cashAccounts.balance` là cache do trigger ghi.** Muốn
 *    đổi thì chèn `payments` / `cashTransactions`, đừng UPDATE thẳng.
 * 3. **Mỗi `payments` tự sinh một phiếu thu sổ quỹ** qua trigger. Không cần —
 *    và không được — tự chèn `cashTransactions` cho thanh toán.
 */

export const invoiceStatus = pgEnum('InvoiceStatus', ['draft', 'completed', 'cancelled'])
export const paymentMethod = pgEnum('PaymentMethod', [
  'cash',
  'bank',
  'wallet',
  'card_balance',
  'points',
  'voucher',
])
export const cashDirection = pgEnum('CashDirection', ['in', 'out'])
export const cashAccountKind = pgEnum('CashAccountKind', ['cash', 'bank', 'wallet'])
export const commissionRole = pgEnum('CommissionRole', ['performer', 'consultant', 'cashier'])

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  draft: 'Đang bán',
  completed: 'Hoàn thành',
  cancelled: 'Đã huỷ',
}

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: 'Tiền mặt',
  bank: 'Chuyển khoản',
  wallet: 'Ví điện tử',
  card_balance: 'Thẻ tài khoản',
  points: 'Điểm tích luỹ',
  voucher: 'Voucher',
}

export const saleChannels = pgTable(
  'sale_channels',
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
  (t) => [uniqueIndex('sale_channels_tenant_name_key').on(t.tenantId, t.name)],
)

export const cashAccounts = pgTable(
  'cash_accounts',
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    kind: cashAccountKind().notNull(),
    name: text().notNull(),
    /** Cache tính lại được từ `cashTransactions` — trigger giữ. */
    balance: numeric({ precision: 14, scale: 2 }).notNull().default('0'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('cash_accounts_tenant_name_key').on(t.tenantId, t.name)],
)

export const invoices = pgTable(
  'invoices',
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),

    code: text().notNull(),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'restrict' }),
    guestName: text('guest_name'),

    status: invoiceStatus().notNull().default('draft'),
    saleChannelId: uuid('sale_channel_id').references(() => saleChannels.id, {
      onDelete: 'set null',
    }),
    priceBookId: uuid('price_book_id').references(() => priceBooks.id, { onDelete: 'set null' }),

    subtotal: numeric({ precision: 14, scale: 2 }).notNull().default('0'),
    discountRatio: numeric('discount_ratio', { precision: 5, scale: 2 }).notNull().default('0'),
    discountAmount: numeric('discount_amount', { precision: 14, scale: 2 }).notNull().default('0'),
    /** §3b.5 — tiền khách trả. Chỉ số này vào doanh thu. */
    total: numeric({ precision: 14, scale: 2 }).notNull().default('0'),
    /** §3b.5 — giá trị buổi dùng từ gói. KHÔNG phải doanh thu. */
    serviceAllocatedValue: numeric('service_allocated_value', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    /** Cache từ `payments` — trigger giữ. */
    paidAmount: numeric('paid_amount', { precision: 14, scale: 2 }).notNull().default('0'),

    note: text(),
    einvoiceLookupCode: text('einvoice_lookup_code'),

    cashierEmployeeId: uuid('cashier_employee_id').references(() => employees.id, {
      onDelete: 'set null',
    }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    issuedAt: timestamp('issued_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'date' }),
    cancelNote: text('cancel_note'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('invoices_tenant_code_key').on(t.tenantId, t.code),
    index('invoices_customer_idx').on(t.customerId, t.issuedAt),
    index('invoices_branch_issued_idx').on(t.branchId, t.issuedAt),
    index('invoices_tenant_status_idx').on(t.tenantId, t.status),
    check(
      'invoices_has_someone',
      sql`${t.customerId} IS NOT NULL OR (${t.guestName} IS NOT NULL AND btrim(${t.guestName}) <> '')`,
    ),
    check(
      'invoices_amounts_not_negative',
      sql`${t.subtotal} >= 0 AND ${t.discountAmount} >= 0 AND ${t.total} >= 0
       AND ${t.serviceAllocatedValue} >= 0 AND ${t.paidAmount} >= 0`,
    ),
    check(
      'invoices_discount_ratio_range',
      sql`${t.discountRatio} >= 0 AND ${t.discountRatio} <= 100`,
    ),
    check(
      'invoices_cancel_needs_reason',
      sql`${t.status} <> 'cancelled'
       OR (${t.cancelledAt} IS NOT NULL AND ${t.cancelNote} IS NOT NULL AND btrim(${t.cancelNote}) <> '')`,
    ),
  ],
)

export const invoiceItems = pgTable(
  'invoice_items',
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    productId: uuid('product_id').references(() => products.id, { onDelete: 'restrict' }),
    productName: text('product_name').notNull(),
    unitName: text('unit_name'),

    /** §3b.2 — liên kết 1-1 sang lịch hẹn. UNIQUE chặn bán một buổi hai lần. */
    bookingItemId: uuid('booking_item_id').references(() => bookingItems.id, {
      onDelete: 'set null',
    }),

    quantity: numeric({ precision: 14, scale: 3 }).notNull().default('1'),
    unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull().default('0'),
    discountRatio: numeric('discount_ratio', { precision: 5, scale: 2 }).notNull().default('0'),
    discountAmount: numeric('discount_amount', { precision: 14, scale: 2 }).notNull().default('0'),
    salePrice: numeric('sale_price', { precision: 14, scale: 2 }).notNull().default('0'),
    lineTotal: numeric('line_total', { precision: 14, scale: 2 }).notNull().default('0'),

    customerPackageItemId: uuid('customer_package_item_id').references(
      () => customerPackageItems.id,
      { onDelete: 'set null' },
    ),
    /** §3b.5 — giá trị buổi dùng từ gói, không cộng vào doanh thu. */
    allocatedValue: numeric('allocated_value', { precision: 14, scale: 2 }).notNull().default('0'),

    note: text(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    index('invoice_items_invoice_idx').on(t.invoiceId),
    index('invoice_items_product_idx').on(t.productId),
    check('invoice_items_quantity_positive', sql`${t.quantity} > 0`),
    check(
      'invoice_items_amounts_not_negative',
      sql`${t.unitPrice} >= 0 AND ${t.discountAmount} >= 0 AND ${t.salePrice} >= 0
       AND ${t.lineTotal} >= 0 AND ${t.allocatedValue} >= 0`,
    ),
    check(
      'invoice_items_discount_ratio_range',
      sql`${t.discountRatio} >= 0 AND ${t.discountRatio} <= 100`,
    ),
  ],
)

export const invoiceItemEmployees = pgTable(
  'invoice_item_employees',
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    invoiceItemId: uuid('invoice_item_id')
      .notNull()
      .references(() => invoiceItems.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    role: commissionRole().notNull(),
    contributionRatio: numeric('contribution_ratio', { precision: 5, scale: 4 })
      .notNull()
      .default('1'),
    /** §3b.7 — chốt lúc bán; sửa bảng hoa hồng sau này không đổi lịch sử. */
    commissionBase: numeric('commission_base', { precision: 14, scale: 2 }).notNull().default('0'),
  },
  (t) => [
    uniqueIndex('invoice_item_employees_key').on(t.invoiceItemId, t.employeeId, t.role),
    check(
      'invoice_item_employees_ratio_range',
      sql`${t.contributionRatio} > 0 AND ${t.contributionRatio} <= 1`,
    ),
  ],
)

export const payments = pgTable(
  'payments',
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    code: text().notNull(),
    method: paymentMethod().notNull(),
    amount: numeric({ precision: 14, scale: 2 }).notNull(),
    cashAccountId: uuid('cash_account_id').references(() => cashAccounts.id, {
      onDelete: 'set null',
    }),
    paidAt: timestamp('paid_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    note: text(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('payments_tenant_code_key').on(t.tenantId, t.code),
    index('payments_invoice_idx').on(t.invoiceId),
    check('payments_amount_positive', sql`${t.amount} > 0`),
  ],
)

export const cashTransactions = pgTable(
  'cash_transactions',
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    cashAccountId: uuid('cash_account_id').references(() => cashAccounts.id, {
      onDelete: 'set null',
    }),

    code: text().notNull(),
    direction: cashDirection().notNull(),
    amount: numeric({ precision: 14, scale: 2 }).notNull(),

    invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'set null' }),
    paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'cascade' }),

    counterpart: text(),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    note: text(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('cash_transactions_tenant_code_key').on(t.tenantId, t.code),
    index('cash_transactions_account_idx').on(t.cashAccountId, t.occurredAt),
    index('cash_transactions_invoice_idx').on(t.invoiceId),
    check('cash_transactions_amount_positive', sql`${t.amount} > 0`),
  ],
)
