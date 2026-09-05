import { desc, eq } from 'drizzle-orm'
import { requirePermission } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { auditLog, users } from '@/lib/schema'
import { AuditTable, type AuditRow } from './audit-table'

export const metadata = { title: 'Nhật ký thao tác' }
export const dynamic = 'force-dynamic'

export default async function AuditPage() {
  const user = await requirePermission('settings.view_audit')

  // Nhật ký chỉ dùng để tra cứu; lấy 500 bản ghi gần nhất là đủ cho mọi tình huống
  // đối soát thường gặp, tránh kéo cả bảng khi dữ liệu lớn dần.
  const rows: AuditRow[] = await db
    .select({
      id: auditLog.id,
      entity: auditLog.entity,
      entityId: auditLog.entityId,
      action: auditLog.action,
      reason: auditLog.reason,
      createdAt: auditLog.createdAt,
      userName: users.fullName,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.userId))
    .where(eq(auditLog.tenantId, user.tenantId))
    .orderBy(desc(auditLog.createdAt))
    .limit(500)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nhật ký thao tác</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Ghi lại mọi thay đổi về tiền, lịch hẹn và truy cập hồ sơ y tế. 500 bản ghi gần nhất.
        </p>
      </div>

      <AuditTable rows={rows} />
    </div>
  )
}
