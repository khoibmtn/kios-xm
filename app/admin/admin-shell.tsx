'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, PanelLeftClose, PanelLeftOpen, ShoppingCart } from 'lucide-react'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { writeSidebarCookie } from './sidebar-state'
import type { NavGroup } from './nav'

function isActive(pathname: string, item: { href?: string; matchPrefix?: boolean }) {
  if (!item.href) return false
  return item.matchPrefix ? pathname.startsWith(item.href) : pathname === item.href
}

function NavList({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <nav className="space-y-5 py-4">
      {groups.map((group, i) => (
        <div key={group.label || i}>
          {group.label && (
            <p className="text-muted-foreground px-3 pb-1.5 text-xs font-medium tracking-wide uppercase">
              {group.label}
            </p>
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.label}>
                {item.href ? (
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={isActive(pathname, item) ? 'page' : undefined}
                    className={cn(
                      'block rounded-md px-3 py-2 text-sm transition',
                      isActive(pathname, item)
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'hover:bg-muted',
                    )}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span
                    className="text-muted-foreground/60 flex items-center justify-between gap-2 px-3 py-2 text-sm"
                    title="Chức năng đang được xây dựng"
                  >
                    {item.label}
                    <span className="bg-muted text-muted-foreground shrink-0 rounded px-1.5 py-0.5 text-[0.65rem]">
                      sắp có
                    </span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export function AdminShell({
  groups,
  children,
  defaultCollapsed,
  tenantLabel,
  userName,
  signOutButton,
}: {
  groups: NavGroup[]
  children: React.ReactNode
  defaultCollapsed: boolean
  tenantLabel: string
  userName: string
  signOutButton: React.ReactNode
}) {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Máy chủ đã đọc cookie và gửi xuống, nên giá trị đầu tiên đã đúng
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  /*
   * Ghi cookie **ngoài** hàm cập nhật state: React coi hàm cập nhật là thuần
   * khiết và được phép gọi lại nó, nên nhét việc ghi vào trong đó là mỗi lần
   * gọi lại một lần lật ngược giá trị đã lưu.
   */
  const toggleCollapsed = () => {
    const next = !collapsed
    writeSidebarCookie(next)
    setCollapsed(next)
  }

  /*
   * Đổi trang thì đóng ngăn kéo, nếu không nó che mất trang vừa mở.
   *
   * Điều chỉnh ngay trong lượt vẽ chứ không dùng `useEffect`: effect chạy
   * **sau khi trình duyệt đã vẽ**, nên ngăn kéo sẽ loé lên trên trang mới rồi
   * mới đóng. Cách này React vẽ lại ngay, chưa kịp hiển thị gì.
   * https://react.dev/learn/you-might-not-need-an-effect
   */
  const [drawerPath, setDrawerPath] = useState(pathname)
  if (drawerPath !== pathname) {
    setDrawerPath(pathname)
    setDrawerOpen(false)
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-primary text-primary-foreground sticky top-0 z-30">
        <div className="flex h-14 items-center gap-2 px-3 sm:px-4">
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <Button variant="onPrimary" size="icon" aria-label="Mở menu" className="lg:hidden">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" title="Menu" className="text-foreground">
              <NavList groups={groups} onNavigate={() => setDrawerOpen(false)} />
            </SheetContent>
          </Sheet>

          <Button
            variant="onPrimary"
            size="icon"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
            className="hidden lg:inline-flex"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-5" />
            ) : (
              <PanelLeftClose className="size-5" />
            )}
          </Button>

          <Link href="/admin" className="shrink-0 font-semibold whitespace-nowrap">
            kios-xm
          </Link>
          <span className="min-w-0 flex-1 truncate text-sm opacity-90">{tenantLabel}</span>

          <div className="flex shrink-0 items-center gap-2">
            {/* Lễ tân chuyển qua lại giữa quầy và quản trị suốt ngày */}
            <Link href="/pos" title="Màn hình thu ngân">
              <Button variant="onPrimary" size="sm">
                <ShoppingCart className="size-4" />
                <span className="hidden sm:inline">Thu ngân</span>
              </Button>
            </Link>
            <span className="hidden max-w-[10rem] truncate text-sm opacity-90 md:inline">
              {userName}
            </span>
            {signOutButton}
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <aside
          className={cn(
            'border-border bg-card hidden shrink-0 border-r lg:block',
            // Thu gọn thì ẩn hẳn thay vì thu nhỏ thành dải biểu tượng: tên mục
            // ở đây là cụm từ tiếng Việt, cắt còn một chữ cái thì vô nghĩa.
            collapsed ? 'w-0 overflow-hidden' : 'w-64',
          )}
        >
          <div className="sticky top-14 max-h-[calc(100dvh-3.5rem)] overflow-y-auto px-2">
            <NavList groups={groups} />
          </div>
        </aside>

        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}
