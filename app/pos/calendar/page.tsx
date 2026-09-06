import { CalendarDays } from 'lucide-react'
import { requirePermission } from '@/lib/auth/session'

export const metadata = { title: 'Lịch hẹn' }

export default async function PosCalendarPage() {
  await requirePermission('booking.view_own')

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-md text-center">
        <CalendarDays className="text-muted-foreground mx-auto size-10" />
        <h1 className="mt-4 text-lg font-semibold">Lưới lịch hẹn đang được dựng</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Sẽ có lưới theo ngày và tuần, kéo–thả để đổi giờ, lọc theo kỹ thuật viên và
          phòng, chặn trùng giờ ngay ở tầng cơ sở dữ liệu.
        </p>
        <p className="text-muted-foreground mt-4 text-xs">
          Trước đó cần khai xong phòng ở <strong>Quản trị → Vị trí, phòng</strong> và
          bước thời gian ở <strong>Cấu hình chung</strong>.
        </p>
      </div>
    </div>
  )
}
