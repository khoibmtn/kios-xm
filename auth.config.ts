import type { NextAuthConfig } from 'next-auth'

/**
 * Các trường ngữ cảnh mà `authorize()` gắn thêm vào user.
 * Khai tường minh vì callback `jwt` nhận `User | AdapterUser`; hợp nhất hai
 * kiểu đó khiến mọi trường riêng thành `unknown`.
 */
interface AuthContextFields {
  tenantId: string
  tenantName: string
  branchId: string
  branchName: string
  employeeId: string | null
  roleCodes: string[]
  permissions: string[]
}

/**
 * Phần cấu hình CHẠY ĐƯỢC TRÊN EDGE (middleware).
 * Không import Prisma / bcrypt ở đây — chúng chỉ chạy được trong Node runtime.
 */
export const authConfig = {
  /**
   * Auth.js chỉ tự tin tưởng Host header khi chạy trên Vercel. Dự án này tự
   * host (Cloudflare Workers) nên phải khai rõ, nếu không mọi request đều bị
   * chặn với lỗi UntrustedHost.
   */
  trustHost: true,

  pages: {
    signIn: '/login',
    error: '/login',
  },

  session: {
    strategy: 'jwt',
    maxAge: 12 * 60 * 60, // 12 giờ — đủ một ca làm việc, hết ca phải đăng nhập lại
  },

  providers: [], // khai trong auth.ts (cần Prisma)

  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const ctx = user as unknown as AuthContextFields
        token.id = user.id as string
        token.tenantId = ctx.tenantId
        token.tenantName = ctx.tenantName
        token.branchId = ctx.branchId
        token.branchName = ctx.branchName
        token.employeeId = ctx.employeeId
        token.roleCodes = ctx.roleCodes
        token.permissions = ctx.permissions
      }
      return token
    },

    session({ session, token }) {
      const ctx = token as unknown as AuthContextFields & { id: string }
      session.user.id = ctx.id
      session.user.tenantId = ctx.tenantId
      session.user.tenantName = ctx.tenantName
      session.user.branchId = ctx.branchId
      session.user.branchName = ctx.branchName
      session.user.employeeId = ctx.employeeId
      session.user.roleCodes = ctx.roleCodes
      session.user.permissions = ctx.permissions
      return session
    },

    authorized({ auth, request }) {
      const signedIn = !!auth?.user
      const { pathname } = request.nextUrl

      // Trang công khai
      if (pathname === '/' || pathname.startsWith('/login')) return true
      if (pathname.startsWith('/api/health')) return true
      // Endpoint chạy định kỳ tự bảo vệ bằng CRON_SECRET, không dùng phiên đăng nhập
      if (pathname.startsWith('/api/cron/')) return true

      // Còn lại bắt buộc đăng nhập
      return signedIn
    },
  },
} satisfies NextAuthConfig
