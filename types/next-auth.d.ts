import type { DefaultSession } from 'next-auth'

/**
 * Session của kios-xm luôn mang theo ngữ cảnh làm việc:
 * đang ở spa nào (tenant), chi nhánh nào, và có những quyền gì.
 */
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      tenantId: string
      tenantName: string
      branchId: string
      branchName: string
      employeeId: string | null
      roleCodes: string[]
      permissions: string[]
    } & DefaultSession['user']
  }

  interface User {
    tenantId: string
    tenantName: string
    branchId: string
    branchName: string
    employeeId: string | null
    roleCodes: string[]
    permissions: string[]
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    tenantId: string
    tenantName: string
    branchId: string
    branchName: string
    employeeId: string | null
    roleCodes: string[]
    permissions: string[]
  }
}
