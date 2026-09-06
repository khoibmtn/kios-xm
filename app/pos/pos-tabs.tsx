'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, ShoppingCart } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/pos/calendar', label: 'Lịch hẹn', icon: CalendarDays },
  { href: '/pos/sale', label: 'Bán hàng', icon: ShoppingCart },
]

/**
 * Hai tab của màn hình thu ngân.
 *
 * Cố ý chỉ có hai, và cố ý không có sidebar: lễ tân đứng quầy thao tác bằng
 * ngón tay, thường trên máy tính bảng ngang. Mọi thứ khác thuộc về Quản trị.
 */
export function PosTabs() {
  const pathname = usePathname()

  return (
    <nav className="flex items-center gap-1">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium transition sm:px-4',
              active ? 'bg-white/20' : 'hover:bg-white/10',
            )}
          >
            <tab.icon className="size-4 shrink-0" />
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
