'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { assertPermission, ForbiddenError } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { tenantFeatures, tenantSettings } from '@/lib/schema'
import { writeAudit } from '@/lib/audit'
import { FEATURE_KEYS, type FeatureKey } from '@/lib/settings/features'

export interface SettingsActionResult {
  ok: boolean
  error?: string
  fieldErrors?: Record<string, string>
}

const settingsSchema = z.object({
  bookingSlotMinutes: z.coerce
    .number('Bước thời gian phải là số')
    .int()
    .refine((n) => [15, 30, 60].includes(n), 'Bước thời gian chỉ nhận 15, 30 hoặc 60 phút'),
  bookingBufferMinutes: z.coerce
    .number('Thời gian đệm phải là số')
    .int('Thời gian đệm phải là số nguyên phút')
    .min(0, 'Thời gian đệm không được âm')
    .max(60, 'Thời gian đệm tối đa 60 phút'),
  limitBookingToShift: z.coerce.boolean().default(false),
  packageRevenueAllocationMode: z.enum(['proportional_retail', 'equal_per_session', 'custom']),
  costingMethod: z.enum(['average', 'fixed']),
  bookClosedUntil: z
    .string()
    .trim()
    .transform((v) => (v === '' ? undefined : v))
    .refine((v) => v === undefined || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Ngày không hợp lệ')
    .optional(),
})

function collectErrors(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const fieldErrors: Record<string, string> = {}
  for (const issue of error.issues) fieldErrors[issue.path.map(String).join('.')] ??= issue.message
  return fieldErrors
}

export async function saveSettingsAction(
  raw: Record<string, unknown>,
): Promise<SettingsActionResult> {
  let user
  try {
    user = await assertPermission('settings.manage')
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'Bạn không có quyền.' }
    throw e
  }

  const parsed = settingsSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Vui lòng kiểm tra lại các ô được đánh dấu.',
      fieldErrors: collectErrors(parsed.error),
    }
  }
  const input = parsed.data

  /*
   * Chỉ ghi đúng các cột cấu hình. Bảng này còn giữ `drive_refresh_token` đã
   * mã hoá và `drive_root_folder_id`; một câu `set` viết rộng tay sẽ xoá kết
   * nối Google Drive mỗi lần ai đó bấm Lưu ở màn hình này.
   */
  const values = {
    bookingSlotMinutes: input.bookingSlotMinutes,
    bookingBufferMinutes: input.bookingBufferMinutes,
    limitBookingToShift: input.limitBookingToShift,
    packageRevenueAllocationMode: input.packageRevenueAllocationMode,
    costingMethod: input.costingMethod,
    bookClosedUntil: input.bookClosedUntil ?? null,
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(tenantSettings)
        .values({ tenantId: user.tenantId, ...values })
        .onConflictDoUpdate({ target: tenantSettings.tenantId, set: values })

      /*
       * Khoá sổ và chế độ phân bổ gói đều đổi con số trên báo cáo đã chốt, nên
       * phải truy được ai đổi lúc nào (AGENTS.md §3b).
       */
      await writeAudit(
        {
          tenantId: user.tenantId,
          userId: user.id,
          entity: 'tenant_settings',
          entityId: user.tenantId,
          action: 'update',
          after: values,
          reason: values.bookClosedUntil ? `Khoá sổ tới ${values.bookClosedUntil}` : undefined,
        },
        tx,
      )
    })

    revalidatePath('/admin/settings')
    return { ok: true }
  } catch (e) {
    console.error('[saveSettingsAction]', e instanceof Error ? e.message : e)
    return { ok: false, error: 'Không lưu được. Vui lòng thử lại.' }
  }
}

export async function toggleFeatureAction(
  key: string,
  enabled: boolean,
): Promise<SettingsActionResult> {
  let user
  try {
    user = await assertPermission('settings.manage')
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'Bạn không có quyền.' }
    throw e
  }

  if (!FEATURE_KEYS.includes(key as FeatureKey)) {
    return { ok: false, error: 'Tính năng không hợp lệ.' }
  }

  try {
    await db
      .insert(tenantFeatures)
      .values({ tenantId: user.tenantId, featureKey: key, enabled })
      .onConflictDoUpdate({
        target: [tenantFeatures.tenantId, tenantFeatures.featureKey],
        set: { enabled },
      })

    revalidatePath('/admin/settings')
    revalidatePath('/admin')
    return { ok: true }
  } catch (e) {
    console.error('[toggleFeatureAction]', e instanceof Error ? e.message : e)
    return { ok: false, error: 'Không đổi được trạng thái tính năng.' }
  }
}

/** Dùng khi cần xoá hẳn một cờ (ví dụ khi gỡ tính năng khỏi danh mục). */
export async function clearFeatureAction(key: string): Promise<SettingsActionResult> {
  try {
    const user = await assertPermission('settings.manage')
    await db
      .delete(tenantFeatures)
      .where(and(eq(tenantFeatures.tenantId, user.tenantId), eq(tenantFeatures.featureKey, key)))
    revalidatePath('/admin/settings')
    return { ok: true }
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'Bạn không có quyền.' }
    console.error('[clearFeatureAction]', e instanceof Error ? e.message : e)
    return { ok: false, error: 'Không xoá được cờ tính năng.' }
  }
}
