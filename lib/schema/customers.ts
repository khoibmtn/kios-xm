import {
  boolean,
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
import { branches, tenants } from './index'

/*
 * Khai lại enum `Gender` thay vì import từ `./index`.
 *
 * `index.ts` re-export tệp này, nên có vòng lặp import; `branches` và `tenants`
 * không sao vì chỉ dùng trong closure của `references(() => ...)` — chạy sau khi
 * mọi module đã nạp xong — còn `gender()` thì gọi ngay lúc dựng bảng, lúc đó
 * biến chưa được gán và cả tiến trình đổ.
 *
 * `pgEnum` chỉ *mô tả* một kiểu đã có trong cơ sở dữ liệu, không tạo ra gì, nên
 * khai hai lần cùng tên là an toàn. Cũng an toàn hơn việc sửa `index.ts` —
 * tệp đó do `drizzle-kit pull` sinh ra và sẽ bị ghi đè.
 */
const gender = pgEnum('Gender', ['male', 'female', 'other'])

/**
 * Khách hàng. Xem `drizzle/0008_customers.sql` để hiểu vì sao có hai nhóm cột.
 *
 * Nhắc lại điều dễ nhầm nhất: `migrated*` là **ảnh chụp từ phần mềm cũ lúc
 * chuyển sang**, không phải số dư sống. Đừng đọc `migratedRemainingSessions`
 * để biết khách còn mấy buổi — con số đó đứng im từ ngày nhập.
 */

export const customerGroups = pgTable(
  'customer_groups',
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex('customer_groups_tenant_id_name_key').on(t.tenantId, t.name)],
)

export const customers = pgTable(
  'customers',
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
    groupId: uuid('group_id').references(() => customerGroups.id, { onDelete: 'set null' }),

    code: text().notNull(),
    name: text().notNull(),
    phone: text(),
    email: text(),
    gender: gender(),
    birthday: date(),

    province: text(),
    ward: text(),
    address: text(),
    formerArea: text('former_area'),
    formerWard: text('former_ward'),

    company: text(),
    taxCode: text('tax_code'),
    facebook: text(),
    source: text(),
    note: text(),
    isActive: boolean('is_active').notNull().default(true),

    migratedAt: timestamp('migrated_at', { withTimezone: true, mode: 'date' }),
    migratedVisits: integer('migrated_visits'),
    migratedTotalSpent: numeric('migrated_total_spent', { precision: 14, scale: 2 }),
    migratedDebt: numeric('migrated_debt', { precision: 14, scale: 2 }),
    migratedCardBalance: numeric('migrated_card_balance', { precision: 14, scale: 2 }),
    migratedRemainingSessions: integer('migrated_remaining_sessions'),
    firstVisitAt: date('first_visit_at'),
    lastVisitAt: date('last_visit_at'),

    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('customers_tenant_id_code_key').on(t.tenantId, t.code),
    index('customers_tenant_phone_idx').on(t.tenantId, t.phone),
    index('customers_tenant_name_idx').on(t.tenantId, t.name),
  ],
)
