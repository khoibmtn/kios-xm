import type { Metadata, Viewport } from 'next'
import { Be_Vietnam_Pro } from 'next/font/google'
import './globals.css'

// Be Vietnam Pro: font Việt, dấu hiển thị chuẩn, đủ nét cho bảng dữ liệu dày.
const beVietnamPro = Be_Vietnam_Pro({
  variable: '--font-sans',
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'kios-xm — Quản lý spa',
    template: '%s · kios-xm',
  },
  description: 'Phần mềm quản lý spa, thẩm mỹ viện: lịch hẹn, bán hàng, gói liệu trình, kho và nhân sự.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Không cho phóng to ngoài ý muốn khi thu ngân bấm nhanh trên tablet,
  // nhưng vẫn cho người dùng chủ động zoom (không đặt maximumScale).
  themeColor: '#0f766e',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="vi" className={`${beVietnamPro.variable} h-full antialiased`}>
      <body className="bg-background text-foreground min-h-full font-sans">
        {children}
      </body>
    </html>
  )
}
