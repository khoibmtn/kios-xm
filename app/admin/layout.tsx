import Link from 'next/link'
import { requireSession, can } from '@/lib/auth/session'
import { signOut } from '@/auth'
import type { Permission } from '@/lib/auth/permissions'

/**
 * Điều hướng tạm. Sidebar đầy đủ theo cây menu là T-05 (Antigravity);
 * ở đây chỉ đủ để tới được các màn hình đã làm xong.
 */
const NAV: { href: string; label: string; permission: Permission }[] = [
  { href: '/admin', label: 'Tổng quan', permission: 'product.view' },
  { href: '/admin/employees', label: 'Nhân viên', permission: 'employee.view' },
  { href: '/admin/audit', label: 'Nhật ký', permission: 'settings.view_audit' },
  { href: '/admin/settings/storage', label: 'Lưu trữ', permission: 'settings.manage' },
]

/**
 * Layout quản trị tối thiểu — đủ để chặn truy cập và hiện ngữ cảnh làm việc.
 * Sidebar đầy đủ theo cây menu là T-05 (Antigravity).
 */
export default async function AdminLayout({
  children,
}: LayoutProps<'/admin'>) {
  const user = await requireSession()

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-primary text-primary-foreground sticky top-0 z-10">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link href="/admin" className="shrink-0 font-semibold whitespace-nowrap">
            kios-xm
          </Link>

          <span className="hidden shrink-0 text-sm opacity-90 xl:inline">
            {user.tenantName} · {user.branchName}
          </span>

          {/* Cuộn ngang trên điện thoại thay vì để chữ chen nhau */}
          <nav className="scrollbar-none -mx-1 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1">
            {NAV.filter((item) => can(user, item.permission)).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="shrink-0 rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap hover:bg-white/15"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden max-w-[10rem] truncate text-sm opacity-90 md:inline">
              {user.name}
            </span>
            <form
              action={async () => {
                'use server'
                await signOut({ redirectTo: '/login' })
              }}
            >
              <button
                type="submit"
                className="rounded-md bg-white/15 px-3 py-1.5 text-sm whitespace-nowrap hover:bg-white/25"
              >
                Thoát
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6">{children}</main>
    </div>
  )
}
