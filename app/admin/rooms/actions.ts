'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { assertPermission, ForbiddenError } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { roomGroups, rooms } from '@/lib/schema'

export interface RoomActionResult {
  ok: boolean
  error?: string
  fieldErrors?: Record<string, string>
}

const roomSchema = z.object({
  name: z.string('Chưa nhập tên').trim().min(1, 'Chưa nhập tên').max(100, 'Tên tối đa 100 ký tự'),
  note: z
    .string()
    .trim()
    .transform((v) => (v === '' ? undefined : v))
    .refine((v) => v === undefined || v.length <= 500, 'Ghi chú tối đa 500 ký tự')
    .optional(),
  groupId: z
    .string()
    .trim()
    .transform((v) => (v === '' ? undefined : v))
    .refine((v) => v === undefined || z.uuid().safeParse(v).success, 'Nhóm không hợp lệ')
    .optional(),
  sortOrder: z
    .string()
    .trim()
    .transform((v) => (v === '' ? 0 : Number(v)))
    .refine((n) => Number.isInteger(n) && n >= 0, 'Số thứ tự phải là số nguyên không âm'),
  isActive: z.coerce.boolean().default(true),
})

function collectErrors(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const fieldErrors: Record<string, string> = {}
  for (const issue of error.issues) fieldErrors[issue.path.map(String).join('.')] ??= issue.message
  return fieldErrors
}

export async function saveRoomAction(
  roomId: string | null,
  raw: { name: string; note: string; groupId: string; sortOrder: string; isActive: boolean },
): Promise<RoomActionResult> {
  let user
  try {
    user = await assertPermission('settings.manage')
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'Bạn không có quyền.' }
    throw e
  }

  const parsed = roomSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Vui lòng kiểm tra lại các ô được đánh dấu.',
      fieldErrors: collectErrors(parsed.error),
    }
  }
  const input = parsed.data

  const values = {
    name: input.name,
    note: input.note ?? null,
    groupId: input.groupId ?? null,
    sortOrder: input.sortOrder,
    isActive: input.isActive,
  }

  try {
    if (roomId) {
      await db
        .update(rooms)
        .set(values)
        .where(and(eq(rooms.id, roomId), eq(rooms.tenantId, user.tenantId)))
    } else {
      await db.insert(rooms).values({
        ...values,
        tenantId: user.tenantId,
        // Phòng là vật lý nên luôn thuộc đúng chi nhánh đang làm việc
        branchId: user.branchId,
      })
    }
    revalidatePath('/admin/rooms')
    return { ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (message.includes('rooms_tenant_branch_name_key')) {
      return {
        ok: false,
        error: 'Chi nhánh này đã có phòng trùng tên.',
        fieldErrors: { name: 'Tên đã được dùng' },
      }
    }
    console.error('[saveRoomAction]', message)
    return { ok: false, error: 'Không lưu được. Vui lòng thử lại.' }
  }
}

export async function deleteRoomAction(roomId: string): Promise<RoomActionResult> {
  try {
    const user = await assertPermission('settings.manage')
    await db.delete(rooms).where(and(eq(rooms.id, roomId), eq(rooms.tenantId, user.tenantId)))
    revalidatePath('/admin/rooms')
    return { ok: true }
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'Bạn không có quyền.' }
    console.error('[deleteRoomAction]', e instanceof Error ? e.message : e)
    return { ok: false, error: 'Không xoá được. Vui lòng thử lại.' }
  }
}

export async function saveRoomGroupAction(
  groupId: string | null,
  rawName: string,
): Promise<RoomActionResult & { id?: string; name?: string }> {
  let user
  try {
    user = await assertPermission('settings.manage')
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'Bạn không có quyền.' }
    throw e
  }

  const parsed = z
    .string('Chưa nhập tên')
    .trim()
    .min(1, 'Chưa nhập tên')
    .max(100, 'Tên tối đa 100 ký tự')
    .safeParse(rawName)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const name = parsed.data

  try {
    if (groupId) {
      await db
        .update(roomGroups)
        .set({ name })
        .where(and(eq(roomGroups.id, groupId), eq(roomGroups.tenantId, user.tenantId)))
      revalidatePath('/admin/rooms')
      return { ok: true, id: groupId, name }
    }

    const [created] = await db
      .insert(roomGroups)
      .values({ tenantId: user.tenantId, name })
      .returning({ id: roomGroups.id, name: roomGroups.name })
    revalidatePath('/admin/rooms')
    return { ok: true, ...created }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (message.includes('room_groups_tenant_name_key')) {
      return { ok: false, error: 'Nhóm vị trí tên này đã có rồi.' }
    }
    console.error('[saveRoomGroupAction]', message)
    return { ok: false, error: 'Không lưu được. Vui lòng thử lại.' }
  }
}

export async function deleteRoomGroupAction(groupId: string): Promise<RoomActionResult> {
  try {
    const user = await assertPermission('settings.manage')

    // Khoá ngoại là ON DELETE SET NULL nên phòng không mất, chỉ rơi khỏi nhóm.
    // Nói trước con số để người dùng biết mình sắp làm gì.
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(rooms)
      .where(and(eq(rooms.tenantId, user.tenantId), eq(rooms.groupId, groupId)))

    await db
      .delete(roomGroups)
      .where(and(eq(roomGroups.id, groupId), eq(roomGroups.tenantId, user.tenantId)))

    revalidatePath('/admin/rooms')
    return { ok: true, error: n > 0 ? `${n} phòng đã được đưa về "Chưa phân nhóm".` : undefined }
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'Bạn không có quyền.' }
    console.error('[deleteRoomGroupAction]', e instanceof Error ? e.message : e)
    return { ok: false, error: 'Không xoá được. Vui lòng thử lại.' }
  }
}
