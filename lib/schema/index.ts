/**
 * Lược đồ cơ sở dữ liệu — kios-xm.
 *
 * Sinh bằng `drizzle-kit pull` từ chính cơ sở dữ liệu đang chạy, nên khớp
 * tuyệt đối với thực tế. Ba điểm được chỉnh tay vì introspect không suy ra được:
 *   1. `id` tự sinh UUID ở tầng Postgres (Prisma trước đây sinh ở tầng ứng dụng)
 *   2. `updatedAt` tự cập nhật khi ghi
 *   3. Cột thời gian trả về `Date` thay vì chuỗi — cần cho tính toán lịch hẹn
 *
 * Quy ước bắt buộc: xem AGENTS.md §3b.
 */
import { pgTable, uniqueIndex, uuid, text, boolean, timestamp, index, foreignKey, date, integer, jsonb, varchar, primaryKey, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const costingMethod = pgEnum("CostingMethod", ['average', 'fixed'])
export const employeeStatus = pgEnum("EmployeeStatus", ['working', 'left'])
export const gender = pgEnum("Gender", ['male', 'female', 'other'])
export const outboxStatus = pgEnum("OutboxStatus", ['pending', 'sent', 'failed', 'processing'])
export const packageAllocationMode = pgEnum("PackageAllocationMode", ['proportional_retail', 'equal_per_session', 'custom'])


export const tenants = pgTable("tenants", {
	id: uuid().primaryKey().defaultRandom().notNull(),
	name: text().notNull(),
	code: text().notNull(),
	plan: text().default('free').notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { precision: 6, withTimezone: true, mode: 'date' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { precision: 6, withTimezone: true, mode: 'date' })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
}, (table) => [
	uniqueIndex("tenants_code_key").using("btree", table.code.asc().nullsLast().op("text_ops")),
]);

export const branches = pgTable("branches", {
	id: uuid().primaryKey().defaultRandom().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	name: text().notNull(),
	address: text(),
	phone: text(),
	timezone: text().default('Asia/Ho_Chi_Minh').notNull(),
	isDefault: boolean("is_default").default(false).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { precision: 6, withTimezone: true, mode: 'date' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { precision: 6, withTimezone: true, mode: 'date' })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
}, (table) => [
	index("branches_tenant_id_idx").using("btree", table.tenantId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("branches_tenant_id_name_key").using("btree", table.tenantId.asc().nullsLast().op("text_ops"), table.name.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "branches_tenant_id_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const users = pgTable("users", {
	id: uuid().primaryKey().defaultRandom().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	email: text(),
	phone: text(),
	passwordHash: text("password_hash"),
	fullName: text("full_name").notNull(),
	avatarUrl: text("avatar_url"),
	isActive: boolean("is_active").default(true).notNull(),
	lastLoginAt: timestamp("last_login_at", { precision: 6, withTimezone: true, mode: 'date' }),
	createdAt: timestamp("created_at", { precision: 6, withTimezone: true, mode: 'date' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { precision: 6, withTimezone: true, mode: 'date' })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
}, (table) => [
	uniqueIndex("users_tenant_id_email_key").using("btree", table.tenantId.asc().nullsLast().op("uuid_ops"), table.email.asc().nullsLast().op("uuid_ops")),
	index("users_tenant_id_idx").using("btree", table.tenantId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("users_tenant_id_phone_key").using("btree", table.tenantId.asc().nullsLast().op("text_ops"), table.phone.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "users_tenant_id_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const roles = pgTable("roles", {
	id: uuid().primaryKey().defaultRandom().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	name: text().notNull(),
	code: text().notNull(),
	permissions: text().array(),
	isSystem: boolean("is_system").default(false).notNull(),
	createdAt: timestamp("created_at", { precision: 6, withTimezone: true, mode: 'date' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	uniqueIndex("roles_tenant_id_code_key").using("btree", table.tenantId.asc().nullsLast().op("text_ops"), table.code.asc().nullsLast().op("text_ops")),
	index("roles_tenant_id_idx").using("btree", table.tenantId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "roles_tenant_id_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const employees = pgTable("employees", {
	id: uuid().primaryKey().defaultRandom().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	userId: uuid("user_id"),
	code: text().notNull(),
	clockCode: text("clock_code"),
	fullName: text("full_name").notNull(),
	phone: text(),
	email: text(),
	gender: gender(),
	birthday: date(),
	idNumber: text("id_number"),
	address: text(),
	bankAccount: text("bank_account"),
	bankName: text(),
	note: text(),
	hiredAt: date("hired_at"),
	leftAt: date("left_at"),
	status: employeeStatus().default('working').notNull(),
	departmentId: uuid("department_id"),
	positionId: uuid("position_id"),
	workBranchId: uuid("work_branch_id"),
	payBranchId: uuid("pay_branch_id"),
	createdAt: timestamp("created_at", { precision: 6, withTimezone: true, mode: 'date' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { precision: 6, withTimezone: true, mode: 'date' })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
}, (table) => [
	uniqueIndex("employees_tenant_id_code_key").using("btree", table.tenantId.asc().nullsLast().op("text_ops"), table.code.asc().nullsLast().op("uuid_ops")),
	index("employees_tenant_id_status_idx").using("btree", table.tenantId.asc().nullsLast().op("enum_ops"), table.status.asc().nullsLast().op("enum_ops")),
	uniqueIndex("employees_user_id_key").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.departmentId],
			foreignColumns: [departments.id],
			name: "employees_department_id_fkey"
		}).onUpdate("cascade").onDelete("set null"),
	foreignKey({
			columns: [table.payBranchId],
			foreignColumns: [branches.id],
			name: "employees_pay_branch_id_fkey"
		}).onUpdate("cascade").onDelete("set null"),
	foreignKey({
			columns: [table.positionId],
			foreignColumns: [positions.id],
			name: "employees_position_id_fkey"
		}).onUpdate("cascade").onDelete("set null"),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "employees_tenant_id_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "employees_user_id_fkey"
		}).onUpdate("cascade").onDelete("set null"),
	foreignKey({
			columns: [table.workBranchId],
			foreignColumns: [branches.id],
			name: "employees_work_branch_id_fkey"
		}).onUpdate("cascade").onDelete("set null"),
]);

export const departments = pgTable("departments", {
	id: uuid().primaryKey().defaultRandom().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	name: text().notNull(),
}, (table) => [
	uniqueIndex("departments_tenant_id_name_key").using("btree", table.tenantId.asc().nullsLast().op("text_ops"), table.name.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "departments_tenant_id_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const positions = pgTable("positions", {
	id: uuid().primaryKey().defaultRandom().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	name: text().notNull(),
}, (table) => [
	uniqueIndex("positions_tenant_id_name_key").using("btree", table.tenantId.asc().nullsLast().op("text_ops"), table.name.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "positions_tenant_id_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const tenantSettings = pgTable("tenant_settings", {
	tenantId: uuid("tenant_id").primaryKey().notNull(),
	bookingSlotMinutes: integer("booking_slot_minutes").default(30).notNull(),
	bookingBufferMinutes: integer("booking_buffer_minutes").default(5).notNull(),
	limitBookingToShift: boolean("limit_booking_to_shift").default(false).notNull(),
	packageRevenueAllocationMode: packageAllocationMode("package_revenue_allocation_mode").default('proportional_retail').notNull(),
	costingMethod: costingMethod("costing_method").default('average').notNull(),
	bookClosedUntil: date("book_closed_until"),
	driveRootFolderId: text("drive_root_folder_id"),
	driveRefreshToken: text("drive_refresh_token"),
	driveConnectedAt: timestamp("drive_connected_at", { precision: 6, withTimezone: true, mode: 'date' }),
	driveConnectedEmail: text("drive_connected_email"),
	updatedAt: timestamp("updated_at", { precision: 6, withTimezone: true, mode: 'date' })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
}, (table) => [
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "tenant_settings_tenant_id_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const files = pgTable("files", {
	id: uuid().primaryKey().defaultRandom().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	provider: text().default('google_drive').notNull(),
	externalId: text("external_id").notNull(),
	path: text().notNull(),
	mime: text().notNull(),
	size: integer().notNull(),
	checksum: text(),
	thumbExternalId: text("thumb_external_id"),
	createdAt: timestamp("created_at", { precision: 6, withTimezone: true, mode: 'date' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("files_tenant_id_path_idx").using("btree", table.tenantId.asc().nullsLast().op("text_ops"), table.path.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "files_tenant_id_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const outboxEvents = pgTable("outbox_events", {
	id: uuid().primaryKey().defaultRandom().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	kind: text().notNull(),
	payload: jsonb().notNull(),
	status: outboxStatus().default('pending').notNull(),
	attempts: integer().default(0).notNull(),
	lastError: text("last_error"),
	createdAt: timestamp("created_at", { precision: 6, withTimezone: true, mode: 'date' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	sentAt: timestamp("sent_at", { precision: 6, withTimezone: true, mode: 'date' }),
}, (table) => [
	index("outbox_events_status_created_at_idx").using("btree", table.status.asc().nullsLast().op("timestamptz_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "outbox_events_tenant_id_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
]);

export const auditLog = pgTable("audit_log", {
	id: uuid().primaryKey().defaultRandom().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	userId: uuid("user_id"),
	entity: text().notNull(),
	entityId: text("entity_id").notNull(),
	action: text().notNull(),
	before: jsonb(),
	after: jsonb(),
	reason: text(),
	ipAddress: text("ip_address"),
	createdAt: timestamp("created_at", { precision: 6, withTimezone: true, mode: 'date' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
	index("audit_log_tenant_id_created_at_idx").using("btree", table.tenantId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("audit_log_tenant_id_entity_entity_id_idx").using("btree", table.tenantId.asc().nullsLast().op("text_ops"), table.entity.asc().nullsLast().op("text_ops"), table.entityId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "audit_log_tenant_id_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "audit_log_user_id_fkey"
		}).onUpdate("cascade").onDelete("set null"),
]);

export const prismaMigrations = pgTable("_prisma_migrations", {
	id: varchar({ length: 36 }).primaryKey().notNull(),
	checksum: varchar({ length: 64 }).notNull(),
	finishedAt: timestamp("finished_at", { withTimezone: true, mode: 'date' }),
	migrationName: varchar("migration_name", { length: 255 }).notNull(),
	logs: text(),
	rolledBackAt: timestamp("rolled_back_at", { withTimezone: true, mode: 'date' }),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	appliedStepsCount: integer("applied_steps_count").default(0).notNull(),
});

export const userBranchRoles = pgTable("user_branch_roles", {
	userId: uuid("user_id").notNull(),
	branchId: uuid("branch_id").notNull(),
	roleId: uuid("role_id").notNull(),
}, (table) => [
	index("user_branch_roles_branch_id_idx").using("btree", table.branchId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.branchId],
			foreignColumns: [branches.id],
			name: "user_branch_roles_branch_id_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	foreignKey({
			columns: [table.roleId],
			foreignColumns: [roles.id],
			name: "user_branch_roles_role_id_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_branch_roles_user_id_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	primaryKey({ columns: [table.userId, table.branchId, table.roleId], name: "user_branch_roles_pkey"}),
]);

export const tenantFeatures = pgTable("tenant_features", {
	tenantId: uuid("tenant_id").notNull(),
	featureKey: text("feature_key").notNull(),
	enabled: boolean().default(false).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "tenant_features_tenant_id_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	primaryKey({ columns: [table.tenantId, table.featureKey], name: "tenant_features_pkey"}),
]);

// Danh mục hàng hoá — tách file riêng cho dễ đọc
export * from './catalog'

// Vị trí / phòng
export * from './rooms'

// Khách hàng
export * from './customers'

// Gói/liệu trình khách đang giữ
export * from './customer-packages'

// Lịch hẹn
export * from './bookings'
