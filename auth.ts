import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { authConfig } from './auth.config'
import { db } from '@/lib/db'
import { branches, employees, roles, tenants, userBranchRoles, users } from '@/lib/schema'

const credentialsSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(1, 'Chưa nhập mật khẩu'),
})

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,

  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },

      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw)
        if (!parsed.success) return null

        const { email, password } = parsed.data

        const [user] = await db
          .select({
            id: users.id,
            email: users.email,
            fullName: users.fullName,
            avatarUrl: users.avatarUrl,
            passwordHash: users.passwordHash,
            tenantId: users.tenantId,
            tenantName: tenants.name,
            tenantActive: tenants.isActive,
          })
          .from(users)
          .innerJoin(tenants, eq(tenants.id, users.tenantId))
          .where(and(eq(users.email, email), eq(users.isActive, true)))
          .limit(1)

        if (!user?.passwordHash || !user.tenantActive) return null

        const ok = await bcrypt.compare(password, user.passwordHash)
        if (!ok) return null

        // Vai trò của người này tại các chi nhánh còn hoạt động
        const assignments = await db
          .select({
            branchId: branches.id,
            branchName: branches.name,
            branchIsDefault: branches.isDefault,
            roleCode: roles.code,
            rolePermissions: roles.permissions,
          })
          .from(userBranchRoles)
          .innerJoin(branches, eq(branches.id, userBranchRoles.branchId))
          .innerJoin(roles, eq(roles.id, userBranchRoles.roleId))
          .where(and(eq(userBranchRoles.userId, user.id), eq(branches.isActive, true)))

        if (assignments.length === 0) return null

        // Chi nhánh khi đăng nhập: ưu tiên chi nhánh được đánh dấu mặc định
        const chosen = assignments.find((a) => a.branchIsDefault) ?? assignments[0]

        // Gộp quyền của mọi vai trò tại chi nhánh đang chọn
        const permissions = [
          ...new Set(
            assignments
              .filter((a) => a.branchId === chosen.branchId)
              .flatMap((a) => a.rolePermissions ?? []),
          ),
        ]

        const [employee] = await db
          .select({ id: employees.id })
          .from(employees)
          .where(eq(employees.userId, user.id))
          .limit(1)

        await db
          .update(users)
          .set({ lastLoginAt: new Date() })
          .where(eq(users.id, user.id))

        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          image: user.avatarUrl,
          tenantId: user.tenantId,
          tenantName: user.tenantName,
          branchId: chosen.branchId,
          branchName: chosen.branchName,
          employeeId: employee?.id ?? null,
          roleCodes: [...new Set(assignments.map((a) => a.roleCode))],
          permissions,
        }
      },
    }),
  ],
})
