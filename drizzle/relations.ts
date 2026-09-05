import { relations } from "drizzle-orm/relations";
import { tenants, branches, users, roles, departments, employees, positions, tenantSettings, files, outboxEvents, auditLog, userBranchRoles, tenantFeatures } from "./schema";

export const branchesRelations = relations(branches, ({one, many}) => ({
	tenant: one(tenants, {
		fields: [branches.tenantId],
		references: [tenants.id]
	}),
	employees_payBranchId: many(employees, {
		relationName: "employees_payBranchId_branches_id"
	}),
	employees_workBranchId: many(employees, {
		relationName: "employees_workBranchId_branches_id"
	}),
	userBranchRoles: many(userBranchRoles),
}));

export const tenantsRelations = relations(tenants, ({many}) => ({
	branches: many(branches),
	users: many(users),
	roles: many(roles),
	employees: many(employees),
	departments: many(departments),
	positions: many(positions),
	tenantSettings: many(tenantSettings),
	files: many(files),
	outboxEvents: many(outboxEvents),
	auditLogs: many(auditLog),
	tenantFeatures: many(tenantFeatures),
}));

export const usersRelations = relations(users, ({one, many}) => ({
	tenant: one(tenants, {
		fields: [users.tenantId],
		references: [tenants.id]
	}),
	employees: many(employees),
	auditLogs: many(auditLog),
	userBranchRoles: many(userBranchRoles),
}));

export const rolesRelations = relations(roles, ({one, many}) => ({
	tenant: one(tenants, {
		fields: [roles.tenantId],
		references: [tenants.id]
	}),
	userBranchRoles: many(userBranchRoles),
}));

export const employeesRelations = relations(employees, ({one}) => ({
	department: one(departments, {
		fields: [employees.departmentId],
		references: [departments.id]
	}),
	branch_payBranchId: one(branches, {
		fields: [employees.payBranchId],
		references: [branches.id],
		relationName: "employees_payBranchId_branches_id"
	}),
	position: one(positions, {
		fields: [employees.positionId],
		references: [positions.id]
	}),
	tenant: one(tenants, {
		fields: [employees.tenantId],
		references: [tenants.id]
	}),
	user: one(users, {
		fields: [employees.userId],
		references: [users.id]
	}),
	branch_workBranchId: one(branches, {
		fields: [employees.workBranchId],
		references: [branches.id],
		relationName: "employees_workBranchId_branches_id"
	}),
}));

export const departmentsRelations = relations(departments, ({one, many}) => ({
	employees: many(employees),
	tenant: one(tenants, {
		fields: [departments.tenantId],
		references: [tenants.id]
	}),
}));

export const positionsRelations = relations(positions, ({one, many}) => ({
	employees: many(employees),
	tenant: one(tenants, {
		fields: [positions.tenantId],
		references: [tenants.id]
	}),
}));

export const tenantSettingsRelations = relations(tenantSettings, ({one}) => ({
	tenant: one(tenants, {
		fields: [tenantSettings.tenantId],
		references: [tenants.id]
	}),
}));

export const filesRelations = relations(files, ({one}) => ({
	tenant: one(tenants, {
		fields: [files.tenantId],
		references: [tenants.id]
	}),
}));

export const outboxEventsRelations = relations(outboxEvents, ({one}) => ({
	tenant: one(tenants, {
		fields: [outboxEvents.tenantId],
		references: [tenants.id]
	}),
}));

export const auditLogRelations = relations(auditLog, ({one}) => ({
	tenant: one(tenants, {
		fields: [auditLog.tenantId],
		references: [tenants.id]
	}),
	user: one(users, {
		fields: [auditLog.userId],
		references: [users.id]
	}),
}));

export const userBranchRolesRelations = relations(userBranchRoles, ({one}) => ({
	branch: one(branches, {
		fields: [userBranchRoles.branchId],
		references: [branches.id]
	}),
	role: one(roles, {
		fields: [userBranchRoles.roleId],
		references: [roles.id]
	}),
	user: one(users, {
		fields: [userBranchRoles.userId],
		references: [users.id]
	}),
}));

export const tenantFeaturesRelations = relations(tenantFeatures, ({one}) => ({
	tenant: one(tenants, {
		fields: [tenantFeatures.tenantId],
		references: [tenants.id]
	}),
}));