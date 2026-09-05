import { NextResponse, type NextRequest } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { processOutbox } from '@/lib/outbox'

export const dynamic = 'force-dynamic'

/**
 * Chạy hộp thư đi và giữ nhịp cho cơ sở dữ liệu.
 *
 * Gọi định kỳ từ GitHub Actions (xem `.github/workflows/cron.yml`).
 * Bảo vệ bằng `CRON_SECRET` để không ai kích hoạt tuỳ tiện từ ngoài.
 *
 * Kèm luôn một truy vấn nhẹ: Supabase Free **tạm dừng project sau 7 ngày
 * không có hoạt động cơ sở dữ liệu**. Spa nghỉ Tết dài là đủ để bị dừng.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Chưa cấu hình CRON_SECRET' }, { status: 500 })
  }

  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (provided !== secret) {
    return NextResponse.json({ error: 'Không được phép' }, { status: 401 })
  }

  const startedAt = Date.now()

  try {
    // Giữ nhịp chống Supabase tạm dừng project
    await db.execute(sql`SELECT 1`)

    const result = await processOutbox()

    return NextResponse.json({
      ok: true,
      ...result,
      durationMs: Date.now() - startedAt,
      at: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : 'Lỗi không xác định',
      },
      { status: 500 },
    )
  }
}
