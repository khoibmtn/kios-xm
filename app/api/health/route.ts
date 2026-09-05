import { NextResponse } from 'next/server'
import { count } from 'drizzle-orm'
import { db } from '@/lib/db'
import { branches, roles, tenants, users } from '@/lib/schema'

export const dynamic = 'force-dynamic'

/** Kiểm tra hệ thống: kết nối cơ sở dữ liệu và dữ liệu nền đã seed. */
export async function GET() {
  const startedAt = Date.now()

  try {
    const [t, b, r, u] = await Promise.all([
      db.select({ n: count() }).from(tenants),
      db.select({ n: count() }).from(branches),
      db.select({ n: count() }).from(roles),
      db.select({ n: count() }).from(users),
    ])

    return NextResponse.json({
      status: 'ok',
      database: {
        connected: true,
        latencyMs: Date.now() - startedAt,
        counts: {
          tenants: t[0].n,
          branches: b[0].n,
          roles: r[0].n,
          users: u[0].n,
        },
      },
      storage: {
        provider: 'google_drive',
        // Chưa kết nối cho tới khi chủ spa cấp quyền lần đầu (ADR-002 §2.2)
        connected: false,
      },
      checkedAt: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        database: { connected: false },
        message: error instanceof Error ? error.message : 'Lỗi không xác định',
      },
      { status: 503 },
    )
  }
}
