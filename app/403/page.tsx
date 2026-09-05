import Link from 'next/link'

export const metadata = { title: 'Không có quyền truy cập' }

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="text-warning text-5xl font-bold">403</p>
      <h1 className="mt-4 text-xl font-semibold">
        Bạn không có quyền xem mục này
      </h1>
      <p className="text-muted-foreground mt-2 max-w-sm text-sm">
        Nếu anh/chị cần truy cập, hãy liên hệ quản lý để được cấp thêm quyền.
      </p>
      <Link
        href="/admin"
        className="text-primary mt-6 text-sm font-medium hover:underline"
      >
        Quay lại trang chính
      </Link>
    </main>
  )
}
