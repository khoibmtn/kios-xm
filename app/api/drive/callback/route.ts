import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { tenantSettings } from '@/lib/schema'
import { encryptSecret } from '@/lib/crypto'
import { GoogleDriveAdapter } from '@/lib/storage'
import { writeAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/** Google gọi lại đây sau khi chủ spa bấm "Cho phép". */
export async function GET(request: NextRequest) {
  const appUrl = process.env.APP_URL ?? 'http://localhost:3000'
  const settingsUrl = new URL('/admin/settings/storage', appUrl)

  const session = await auth()
  if (!session?.user || !session.user.permissions.includes('settings.manage')) {
    return NextResponse.redirect(new URL('/403', appUrl))
  }

  const code = request.nextUrl.searchParams.get('code')
  const error = request.nextUrl.searchParams.get('error')
  const state = request.nextUrl.searchParams.get('state')

  if (error) {
    settingsUrl.searchParams.set('error', 'Bạn đã từ chối cấp quyền cho ứng dụng.')
    return NextResponse.redirect(settingsUrl)
  }
  if (!code) {
    settingsUrl.searchParams.set('error', 'Google không trả về mã cấp quyền.')
    return NextResponse.redirect(settingsUrl)
  }
  // Chặn kịch bản mã cấp quyền của spa này bị dùng cho spa khác.
  if (state !== session.user.tenantId) {
    settingsUrl.searchParams.set('error', 'Phiên cấp quyền không khớp, hãy thử lại.')
    return NextResponse.redirect(settingsUrl)
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      settingsUrl.searchParams.set('error', `Google từ chối cấp token: ${await tokenRes.text()}`)
      return NextResponse.redirect(settingsUrl)
    }

    const token = (await tokenRes.json()) as {
      refresh_token?: string
      access_token: string
    }

    if (!token.refresh_token) {
      settingsUrl.searchParams.set(
        'error',
        'Google không trả về refresh token. Hãy gỡ quyền của ứng dụng trong Tài khoản Google rồi kết nối lại.',
      )
      return NextResponse.redirect(settingsUrl)
    }

    // Tạo thư mục gốc ngay — scope drive.file chỉ với tới tệp do app tạo,
    // nên phải tự tạo chứ không dùng được thư mục có sẵn (ADR-002 §2.2).
    const adapter = new GoogleDriveAdapter({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      refreshToken: token.refresh_token,
    })

    const rootFolderId = await adapter.ensureRootFolder()
    const health = await adapter.healthCheck()

    const driveFields = {
      driveRefreshToken: await encryptSecret(token.refresh_token),
      driveRootFolderId: rootFolderId,
      driveConnectedAt: new Date(),
      driveConnectedEmail: health.message?.split(' ·')[0] ?? null,
    }

    await db
      .insert(tenantSettings)
      .values({ tenantId: session.user.tenantId, ...driveFields })
      .onConflictDoUpdate({
        target: tenantSettings.tenantId,
        set: driveFields,
      })

    await writeAudit({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      entity: 'storage.google_drive',
      entityId: rootFolderId,
      action: 'update',
      after: { connected: true },
      reason: 'Kết nối Google Drive',
    })

    settingsUrl.searchParams.set('connected', '1')
    return NextResponse.redirect(settingsUrl)
  } catch (err) {
    settingsUrl.searchParams.set(
      'error',
      err instanceof Error ? err.message : 'Lỗi không xác định khi kết nối Drive.',
    )
    return NextResponse.redirect(settingsUrl)
  }
}
