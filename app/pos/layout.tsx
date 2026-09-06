import Link from 'next/link'
import { LayoutGrid } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { signOut } from '@/auth'
import { Button } from '@/components/ui/button'
import { PosTabs } from './pos-tabs'

/**
 * Bề mặt thu ngân — tách hẳn khỏi Quản trị.
 *
 * Quản trị là bảng dày đặc trên màn hình lớn; thu ngân là thao tác nhanh bằng
 * ngón tay, thường trên máy tính bảng ngang 1024×768 dựng ở quầy. Gộp hai thứ
 * vào một layout sẽ khiến cả hai đều dở, nên chúng có shell riêng
 * (`docs/research/01-module-map.md` §1).
 *
 * Không sidebar, chỉ hai tab, và cả thanh trên cùng cao đúng 56px để chừa tối
 * đa chiều dọc cho lưới lịch hẹn.
 */
export default async function PosLayout({ children }: LayoutProps<'/pos'>) {
  const user = await requireSession()

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="bg-primary text-primary-foreground shrink-0">
        <div className="flex h-14 items-center gap-2 px-2 sm:px-4">
          <PosTabs />

          <span className="min-w-0 flex-1 truncate text-center text-sm opacity-90 sm:text-left">
            {user.branchName}
          </span>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Link href="/admin" title="Về Quản trị">
              <Button variant="onPrimary" size="icon" aria-label="Về Quản trị">
                <LayoutGrid className="size-5" />
              </Button>
            </Link>
            <span className="hidden max-w-[9rem] truncate text-sm opacity-90 lg:inline">
              {user.name}
            </span>
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
          </div>
        </div>
      </header>

      {/* `min-h-0` để phần thân cuộn được thay vì đẩy thanh trên cùng ra ngoài */}
      <main className="min-h-0 flex-1 overflow-auto">{children}</main>
    </div>
  )
}
