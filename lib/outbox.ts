import { and, asc, eq, lt, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { outboxEvents } from '@/lib/schema'

/**
 * Hộp thư đi (outbox).
 *
 * Vì sao cần: khi hoàn tất hoá đơn, hệ thống vừa phải ghi hàng loạt thay đổi
 * vào cơ sở dữ liệu (trừ buổi, trừ kho, ghi hoa hồng, lập phiếu thu) vừa phải
 * gửi tin ra ngoài (Zalo cảm ơn, link đánh giá). Hai việc này KHÔNG thể nằm
 * chung một transaction: nếu gọi Zalo ngay giữa transaction mà nó chậm hoặc
 * lỗi, cả hoá đơn bị cuộn ngược — trong khi tin có thể đã gửi đi rồi.
 *
 * Cách làm: ghi ý định gửi vào bảng này NGAY TRONG transaction nghiệp vụ.
 * Nghiệp vụ hỏng thì ý định gửi cũng biến mất. Nghiệp vụ xong thì một tiến
 * trình riêng đọc ra và gửi, có thử lại.
 */

export type OutboxKind =
  | 'SEND_BOOKING_REMINDER' // nhắc lịch hẹn trước giờ hẹn
  | 'SEND_THANKYOU' // cảm ơn sau khi hoàn tất dịch vụ
  | 'SEND_RATING_LINK' // mời đánh giá
  | 'SEND_BIRTHDAY_WISH'
  | 'SEND_PACKAGE_EXPIRY_WARNING' // gói sắp hết hạn

/** Tối đa 5 lần; sau đó chuyển `failed` để người vận hành xem lại. */
const MAX_ATTEMPTS = 5

/** Giãn cách thử lại: 1, 5, 15, 60 phút. */
const BACKOFF_MINUTES = [1, 5, 15, 60, 60]

type DbClient = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Xếp một việc cần gửi vào hàng đợi.
 * LUÔN truyền `tx` khi gọi bên trong transaction nghiệp vụ.
 */
export async function enqueueOutbox(
  input: { tenantId: string; kind: OutboxKind; payload: Record<string, unknown> },
  client: DbClient = db,
): Promise<void> {
  await client.insert(outboxEvents).values({
    tenantId: input.tenantId,
    kind: input.kind,
    payload: input.payload,
    status: 'pending',
  })
}

export interface OutboxHandlerResult {
  ok: boolean
  /** Lỗi vĩnh viễn (payload sai) — đừng thử lại nữa. */
  permanent?: boolean
  message?: string
}

export type OutboxHandler = (
  payload: Record<string, unknown>,
  ctx: { tenantId: string; eventId: string },
) => Promise<OutboxHandlerResult>

/**
 * Nơi cắm kênh gửi thật.
 *
 * Chưa nối Zalo/SMS nên tạm ghi nhận là đã xử lý — mục đích của T-19 là dựng
 * đúng cơ chế (transaction, thử lại, không gửi trùng) để khi có tài khoản
 * Zalo OA thì chỉ việc thay thân hàm.
 */
const handlers: Record<string, OutboxHandler> = {
  SEND_BOOKING_REMINDER: async (payload) => {
    console.log('[outbox] nhắc lịch hẹn', payload)
    return { ok: true }
  },
  SEND_THANKYOU: async (payload) => {
    console.log('[outbox] cảm ơn khách', payload)
    return { ok: true }
  },
  SEND_RATING_LINK: async (payload) => {
    console.log('[outbox] mời đánh giá', payload)
    return { ok: true }
  },
  SEND_BIRTHDAY_WISH: async (payload) => {
    console.log('[outbox] chúc sinh nhật', payload)
    return { ok: true }
  },
  SEND_PACKAGE_EXPIRY_WARNING: async (payload) => {
    console.log('[outbox] cảnh báo gói sắp hết hạn', payload)
    return { ok: true }
  },
}

export interface ProcessResult {
  claimed: number
  sent: number
  retried: number
  failed: number
}

/**
 * Xử lý một mẻ sự kiện đang chờ.
 *
 * Chống gửi trùng: dùng `UPDATE … RETURNING` để giành quyền xử lý. Hai tiến
 * trình chạy song song thì chỉ một giành được mỗi bản ghi, vì Postgres khoá
 * dòng khi cập nhật.
 */
export async function processOutbox(batchSize = 25): Promise<ProcessResult> {
  // Thu hồi những việc bị treo: tiến trình trước giành rồi chết giữa chừng.
  // Sau 10 phút coi như hỏng và cho thử lại.
  await db.execute(sql`
    UPDATE ${outboxEvents}
    SET status = 'pending', last_error = 'Tiến trình xử lý trước bị gián đoạn'
    WHERE status = 'processing'
      AND created_at < now() - interval '10 minutes'
  `)

  // Giành quyền xử lý. SKIP LOCKED để nhiều tiến trình chạy song song không
  // giẫm chân nhau; mỗi bản ghi chỉ một tiến trình lấy được.
  const claimed = await db
    .update(outboxEvents)
    .set({ status: 'processing', attempts: sql`${outboxEvents.attempts} + 1` })
    .where(
      sql`${outboxEvents.id} IN (
        SELECT id FROM ${outboxEvents}
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )`,
    )
    .returning()

  const result: ProcessResult = {
    claimed: claimed.length,
    sent: 0,
    retried: 0,
    failed: 0,
  }

  for (const event of claimed) {
    const handler = handlers[event.kind]

    if (!handler) {
      await db
        .update(outboxEvents)
        .set({ status: 'failed', lastError: `Không có handler cho "${event.kind}"` })
        .where(eq(outboxEvents.id, event.id))
      result.failed++
      continue
    }

    try {
      const r = await handler((event.payload ?? {}) as Record<string, unknown>, {
        tenantId: event.tenantId,
        eventId: event.id,
      })

      if (r.ok) {
        await db
          .update(outboxEvents)
          .set({ status: 'sent', sentAt: new Date(), lastError: null })
          .where(eq(outboxEvents.id, event.id))
        result.sent++
        continue
      }

      const giveUp = r.permanent || event.attempts + 1 >= MAX_ATTEMPTS
      await db
        .update(outboxEvents)
        .set({
          status: giveUp ? 'failed' : 'pending',
          lastError: r.message ?? 'Gửi không thành công',
        })
        .where(eq(outboxEvents.id, event.id))
      giveUp ? result.failed++ : result.retried++
    } catch (error) {
      const giveUp = event.attempts + 1 >= MAX_ATTEMPTS
      await db
        .update(outboxEvents)
        .set({
          status: giveUp ? 'failed' : 'pending',
          lastError: error instanceof Error ? error.message : 'Lỗi không xác định',
        })
        .where(eq(outboxEvents.id, event.id))
      giveUp ? result.failed++ : result.retried++
    }
  }

  return result
}

/** Số việc đang chờ và số việc hỏng — hiện trên màn hình quản trị. */
export async function outboxStats(tenantId: string) {
  const rows = await db
    .select({ status: outboxEvents.status, n: sql<number>`count(*)::int` })
    .from(outboxEvents)
    .where(eq(outboxEvents.tenantId, tenantId))
    .groupBy(outboxEvents.status)

  const stats = { pending: 0, sent: 0, failed: 0, processing: 0 }
  for (const r of rows) stats[r.status] = r.n
  return stats
}

export { MAX_ATTEMPTS, BACKOFF_MINUTES }
