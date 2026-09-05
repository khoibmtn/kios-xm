import { redirect } from 'next/navigation'
import type { Session } from 'next-auth'
import { auth } from '@/auth'
import type { Permission } from './permissions'

export type AppSession = Session['user']

/** Lấy phiên hiện tại, chuyển hướng về đăng nhập nếu chưa có. */
export async function requireSession(): Promise<AppSession> {
  const session = await auth()
  if (!session?.user) redirect('/login')
  return session.user
}

/**
 * Bắt buộc có quyền, nếu không thì chặn.
 * Dùng ở đầu mỗi server action / page nhạy cảm.
 */
export async function requirePermission(
  permission: Permission,
): Promise<AppSession> {
  const user = await requireSession()
  if (!user.permissions.includes(permission)) {
    redirect('/403')
  }
  return user
}

/** Cần ÍT NHẤT một trong các quyền. */
export async function requireAnyPermission(
  permissions: readonly Permission[],
): Promise<AppSession> {
  const user = await requireSession()
  if (!permissions.some((p) => user.permissions.includes(p))) {
    redirect('/403')
  }
  return user
}

/** Kiểm tra mềm, không chuyển hướng — dùng để ẩn/hiện phần tử giao diện. */
export function can(user: AppSession, permission: Permission): boolean {
  return user.permissions.includes(permission)
}

/**
 * Ném lỗi thay vì chuyển hướng — dùng trong server action và route handler,
 * nơi redirect không phải phản hồi phù hợp.
 */
export class ForbiddenError extends Error {
  constructor(permission: string) {
    super(`Không có quyền: ${permission}`)
    this.name = 'ForbiddenError'
  }
}

export async function assertPermission(
  permission: Permission,
): Promise<AppSession> {
  const session = await auth()
  if (!session?.user) throw new ForbiddenError('chưa đăng nhập')
  if (!session.user.permissions.includes(permission)) {
    throw new ForbiddenError(permission)
  }
  return session.user
}
