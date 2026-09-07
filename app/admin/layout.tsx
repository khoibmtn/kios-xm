import { cookies } from 'next/headers'
import { requireSession, can } from '@/lib/auth/session'
import { signOut } from '@/auth'
import { Button } from '@/components/ui/button'
import { AdminShell } from './admin-shell'
import { NAV_GROUPS } from './nav'
import { SIDEBAR_COOKIE } from './sidebar-state'

export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  const user = await requireSession()

  // Đọc trước khi vẽ để HTML đầu tiên đã đúng bề rộng — xem `sidebar-state.ts`
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === '1'

  /*
   * Lọc menu ở phía máy chủ, không ở trình duyệt. Danh sách mục mà người dùng
   * không được thấy cũng là thông tin — nó cho biết hệ thống có những gì và ai
   * được đụng vào. Gửi xuống trình duyệt rồi mới ẩn bằng CSS thì vẫn đọc được
   * trong mã nguồn trang.
   */
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => can(user, item.permission)),
  })).filter((group) => group.items.length > 0)

  return (
    <AdminShell
      groups={groups}
      defaultCollapsed={collapsed}
      tenantLabel={`${user.tenantName} · ${user.branchName}`}
      userName={user.name ?? ''}
      signOutButton={
        <form
          action={async () => {
            'use server'
            await signOut({ redirectTo: '/login' })
          }}
        >
          <Button type="submit" variant="onPrimary" size="sm">
            Thoát
          </Button>
        </form>
      }
    >
      {children}
    </AdminShell>
  )
}
