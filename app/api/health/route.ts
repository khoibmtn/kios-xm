import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** Kiểm tra hệ thống: kết nối cơ sở dữ liệu và dữ liệu nền đã seed. */
export async function GET() {
  const startedAt = Date.now()

  try {
    const [tenants, branches, roles, users] = await Promise.all([
      db.tenant.count(),
      db.branch.count(),
      db.role.count(),
      db.user.count(),
    ])

    return NextResponse.json({
      status: 'ok',
      database: {
        connected: true,
        latencyMs: Date.now() - startedAt,
        counts: { tenants, branches, roles, users },
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
