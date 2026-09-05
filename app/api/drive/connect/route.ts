import { NextResponse } from 'next/server'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

/**
 * Bắt đầu luồng cấp quyền Google Drive.
 * Chỉ người có quyền thiết lập hệ thống mới được kết nối kho lưu trữ của spa.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.redirect(new URL('/login', process.env.APP_URL))
  }
  if (!session.user.permissions.includes('settings.manage')) {
    return NextResponse.redirect(new URL('/403', process.env.APP_URL))
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'Chưa cấu hình GOOGLE_CLIENT_ID / GOOGLE_REDIRECT_URI' },
      { status: 500 },
    )
  }

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  // drive.file: chỉ với tới tệp do chính ứng dụng tạo — không đọc được
  // phần còn lại trong Drive của người dùng.
  url.searchParams.set('scope', 'https://www.googleapis.com/auth/drive.file')
  // Bắt buộc để nhận refresh_token; thiếu 2 tham số này Google chỉ trả
  // access_token sống 1 giờ.
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('state', session.user.tenantId)

  return NextResponse.redirect(url.toString())
}
