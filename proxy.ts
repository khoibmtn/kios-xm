import NextAuth from 'next-auth'
import { authConfig } from './auth.config'

/**
 * Next.js 16 đổi tên quy ước `middleware` thành `proxy`.
 *
 * Chạy trên Edge runtime, nơi KHÔNG dùng được Prisma/bcrypt — vì vậy chỉ nạp
 * phần cấu hình edge-safe: đọc JWT rồi quyết định cho đi tiếp hay đẩy về
 * /login. Kiểm tra quyền chi tiết làm ở server component và server action
 * (lib/auth/session.ts).
 */
const { auth } = NextAuth(authConfig)

export default auth

export const config = {
  matcher: [
    /*
     * Bỏ qua: tệp tĩnh, ảnh tối ưu, favicon, và route xác thực của Auth.js.
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
