import { db } from '@/lib/db'
import { auditLog } from '@/lib/schema'

/**
 * Nhật ký thao tác.
 *
 * BẮT BUỘC ghi với: thay đổi tiền, thay đổi lịch hẹn, truy cập hồ sơ y tế,
 * sửa người thực hiện/tư vấn trên hoá đơn đã hoàn tất, điều chỉnh số buổi gói.
 *
 * Hàm nhận `client` để ghi CHUNG transaction với nghiệp vụ — nếu nghiệp vụ
 * cuộn ngược thì log cũng biến mất, tránh ghi lại việc chưa từng xảy ra.
 */

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'view' // dùng cho dữ liệu nhạy cảm: hồ sơ y tế, ảnh điều trị
  | 'login'
  | 'export'
  | 'cancel'
  | 'adjust'

export interface AuditInput {
  tenantId: string
  userId?: string | null
  entity: string
  entityId: string
  action: AuditAction
  before?: unknown
  after?: unknown
  /** Bắt buộc với hành động điều chỉnh/huỷ — phục vụ đối soát về sau. */
  reason?: string
  ipAddress?: string | null
}

/** `db` hoặc tham số `tx` bên trong `db.transaction(...)`. */
type DbClient = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function writeAudit(
  input: AuditInput,
  client: DbClient = db,
): Promise<void> {
  await client.insert(auditLog).values({
    tenantId: input.tenantId,
    userId: input.userId ?? null,
    entity: input.entity,
    entityId: input.entityId,
    action: input.action,
    before: input.before ?? null,
    after: input.after ?? null,
    reason: input.reason ?? null,
    ipAddress: input.ipAddress ?? null,
  })
}

/**
 * Ghi lại việc XEM hồ sơ y tế.
 *
 * Dữ liệu y tế của khách là thông tin nhạy cảm: ai mở, mở của ai, lúc nào —
 * đều phải truy được. Gọi ngay trước khi trả dữ liệu về giao diện.
 */
export async function auditMedicalAccess(params: {
  tenantId: string
  userId: string
  customerId: string
  kind: 'record' | 'image' | 'visit'
  ipAddress?: string | null
}): Promise<void> {
  await writeAudit({
    tenantId: params.tenantId,
    userId: params.userId,
    entity: `medical.${params.kind}`,
    entityId: params.customerId,
    action: 'view',
    ipAddress: params.ipAddress,
  })
}

/** Chỉ giữ các trường thực sự đổi — log gọn và dễ đọc khi đối soát. */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): { before: Partial<T>; after: Partial<T> } {
  const b: Partial<T> = {}
  const a: Partial<T> = {}

  for (const key of Object.keys(after) as (keyof T)[]) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      b[key] = before[key]
      a[key] = after[key] as T[keyof T]
    }
  }

  return { before: b, after: a }
}
