import { and, desc, eq, like } from 'drizzle-orm'
import { db } from '@/lib/db'
import { products } from '@/lib/schema'
import { CODE_PREFIX, type ProductInput } from './product-schema'

/**
 * Mã hàng kế tiếp theo loại: SP0001, DV0002…
 *
 * Có thể trùng nếu hai người tạo cùng lúc, nên ràng buộc UNIQUE trên
 * (tenant_id, code) mới là thứ bảo đảm cuối cùng — chỗ này chỉ lo phần gợi ý.
 *
 * Nhận `client` để dùng lại được trong một giao dịch đang mở: gọi `db` toàn
 * cục khi transaction đang giữ kết nối duy nhất của pool là công thức treo.
 */
export async function nextProductCode(
  tenantId: string,
  kind: ProductInput['kind'],
  client: Pick<typeof db, 'select'> = db,
): Promise<string> {
  const prefix = CODE_PREFIX[kind]

  const [row] = await client
    .select({ code: products.code })
    .from(products)
    .where(and(eq(products.tenantId, tenantId), like(products.code, `${prefix}%`)))
    .orderBy(desc(products.code))
    .limit(1)

  const current = row?.code?.slice(prefix.length) ?? '0'
  const next = Number.parseInt(current, 10) + 1
  return `${prefix}${String(Number.isFinite(next) ? next : 1).padStart(4, '0')}`
}
