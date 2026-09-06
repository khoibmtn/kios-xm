import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { branches, tenants } from './index'

/**
 * Vị trí / phòng — nơi diễn ra một buổi dịch vụ.
 *
 * Phòng gắn chi nhánh vì nó là vật lý; nhóm phòng chỉ là nhãn ("Tầng 1", "Khu
 * VIP") nên để ở mức spa. Xem `drizzle/0006_rooms.sql`.
 */

export const roomGroups = pgTable(
  'room_groups',
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { precision: 6, withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex('room_groups_tenant_name_key').on(t.tenantId, t.name)],
)

export const rooms = pgTable(
  'rooms',
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id').references(() => roomGroups.id, { onDelete: 'set null' }),
    name: text().notNull(),
    note: text(),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { precision: 6, withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('rooms_tenant_branch_name_key').on(t.tenantId, t.branchId, t.name),
    index('rooms_branch_active_idx').on(t.branchId, t.isActive),
  ],
)
