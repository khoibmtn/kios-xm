import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { authConfig } from './auth.config'
import { db } from '@/lib/db'

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

        const user = await db.user.findFirst({
          where: { email, isActive: true },
          include: {
            tenant: true,
            employee: { select: { id: true } },
            branchRoles: {
              include: {
                branch: { select: { id: true, name: true, isDefault: true, isActive: true } },
                role: { select: { code: true, permissions: true } },
              },
            },
          },
        })

        if (!user?.passwordHash) return null
        if (!user.tenant.isActive) return null

        const ok = await bcrypt.compare(password, user.passwordHash)
        if (!ok) return null

        // Chi nhánh mặc định khi đăng nhập: ưu tiên chi nhánh được đánh dấu mặc định
        const activeRoles = user.branchRoles.filter((br) => br.branch.isActive)
        if (activeRoles.length === 0) return null

        const chosen =
          activeRoles.find((br) => br.branch.isDefault) ?? activeRoles[0]

        // Gộp quyền của mọi vai trò tại chi nhánh đang chọn
        const permissions = [
          ...new Set(
            activeRoles
              .filter((br) => br.branch.id === chosen.branch.id)
              .flatMap((br) => br.role.permissions),
          ),
        ]

        await db.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        })

        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          image: user.avatarUrl,
          tenantId: user.tenantId,
          tenantName: user.tenant.name,
          branchId: chosen.branch.id,
          branchName: chosen.branch.name,
          employeeId: user.employee?.id ?? null,
          roleCodes: [...new Set(activeRoles.map((br) => br.role.code))],
          permissions,
        }
      },
    }),
  ],
})
