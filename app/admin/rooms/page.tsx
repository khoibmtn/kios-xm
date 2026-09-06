import { asc, eq, and } from 'drizzle-orm'
import { requirePermission, can } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { roomGroups, rooms } from '@/lib/schema'
import { RoomManager } from './room-manager'

export const metadata = { title: 'Vị trí, phòng' }
export const dynamic = 'force-dynamic'

export default async function RoomsPage() {
  const user = await requirePermission('settings.manage')

  const [roomRows, groupRows] = await Promise.all([
    db
      .select({
        id: rooms.id,
        name: rooms.name,
        note: rooms.note,
        groupId: rooms.groupId,
        sortOrder: rooms.sortOrder,
        isActive: rooms.isActive,
      })
      .from(rooms)
      // Phòng là vật lý — chỉ hiện phòng của chi nhánh đang làm việc
      .where(and(eq(rooms.tenantId, user.tenantId), eq(rooms.branchId, user.branchId)))
      .orderBy(asc(rooms.sortOrder), asc(rooms.name)),

    db
      .select({ id: roomGroups.id, name: roomGroups.name })
      .from(roomGroups)
      .where(eq(roomGroups.tenantId, user.tenantId))
      .orderBy(asc(roomGroups.sortOrder), asc(roomGroups.name)),
  ])

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vị trí, phòng</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Giường, phòng và khu vực làm dịch vụ. Khai đủ ở đây thì lịch hẹn mới chặn
          được hai khách vào cùng một chỗ.
        </p>
      </div>

      <RoomManager
        rooms={roomRows}
        groups={groupRows}
        branchName={user.branchName ?? 'Chi nhánh hiện tại'}
        canManage={can(user, 'settings.manage')}
      />
    </div>
  )
}
