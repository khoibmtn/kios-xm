/**
 * Trạng thái thu gọn của thanh menu — lưu bằng **cookie**, không phải
 * localStorage.
 *
 * localStorage chỉ đọc được sau khi trang đã gắn vào DOM, nên máy chủ luôn
 * dựng HTML với menu mở rộng: người thu gọn menu tải trang nào cũng thấy menu
 * bung ra rồi mới co lại. Cookie thì đi kèm ngay trong request, layout quản trị
 * vốn đã đọc phiên đăng nhập nên đọc thêm một cookie không tốn gì — và HTML
 * đầu tiên đã đúng bề rộng, không còn gì để nhấp nháy.
 *
 * Module này **không có `'use client'`**: cả layout máy chủ lẫn shell trình
 * duyệt cùng dùng, mà hằng số nhập từ module `'use client'` sang phía máy chủ
 * chỉ là một tham chiếu rỗng (xem `AGENTS.md` §3c).
 */

export const SIDEBAR_COOKIE = 'kios-xm-sidebar-collapsed'

/** Một năm: đây là tuỳ chọn hiển thị, không phải phiên đăng nhập. */
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

/**
 * Ghi cookie ngay trong trình duyệt, không qua server action: đổi bề rộng menu
 * mà phải đợi một vòng mạng thì nút bấm có cảm giác lag.
 */
export function writeSidebarCookie(collapsed: boolean) {
  document.cookie = [
    `${SIDEBAR_COOKIE}=${collapsed ? '1' : '0'}`,
    'path=/',
    `max-age=${ONE_YEAR_SECONDS}`,
    'samesite=lax',
  ].join('; ')
}
