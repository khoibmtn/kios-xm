import { requireSession } from '@/lib/auth/session'
import { signOut } from '@/auth'

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
        <div className="flex h-14 items-center gap-4 px-4">
          <span className="font-semibold">kios-xm</span>

          <span className="hidden text-sm opacity-90 sm:inline">
            {user.tenantName} · {user.branchName}
          </span>

          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm opacity-90">{user.name}</span>
            <form
              action={async () => {
                'use server'
                await signOut({ redirectTo: '/login' })
              }}
            >
              <button
                type="submit"
                className="rounded-md bg-white/15 px-3 py-1.5 text-sm hover:bg-white/25"
              >
                Đăng xuất
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6">{children}</main>
    </div>
  )
}
