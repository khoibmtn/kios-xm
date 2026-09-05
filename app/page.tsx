import Link from 'next/link'

const modules = [
  { name: 'Lịch hẹn', desc: 'Lưới ngày / tuần / theo KTV, chống trùng phòng và người' },
  { name: 'Thu ngân', desc: 'Bán dịch vụ, sản phẩm, gói liệu trình và thẻ trả trước' },
  { name: 'Khách hàng', desc: 'Hồ sơ, gói còn lại, số dư thẻ, ảnh trước/sau' },
  { name: 'Hàng hoá', desc: 'Sản phẩm · Dịch vụ · Gói liệu trình · Thẻ tài khoản' },
  { name: 'Kho', desc: 'Nhập hàng, kiểm kho, định mức nguyên vật liệu' },
  { name: 'Nhân sự', desc: 'Ca làm việc, chấm công, hoa hồng 3 vai trò, bảng lương' },
]

export default function HomePage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <header className="mb-12">
        <p className="text-primary text-sm font-semibold tracking-wide uppercase">
          Đang phát triển · Giai đoạn M0
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">kios-xm</h1>
        <p className="text-muted-foreground mt-3 text-lg">
          Phần mềm quản lý spa và thẩm mỹ viện.
        </p>
      </header>

      <section className="mb-12 grid gap-4 sm:grid-cols-2">
        {modules.map((m) => (
          <div
            key={m.name}
            className="border-border bg-card rounded-lg border p-5"
          >
            <h2 className="font-semibold">{m.name}</h2>
            <p className="text-muted-foreground mt-1 text-sm">{m.desc}</p>
          </div>
        ))}
      </section>

      <footer className="border-border text-muted-foreground flex flex-wrap items-center gap-4 border-t pt-6 text-sm">
        <Link href="/api/health" className="text-primary hover:underline">
          Kiểm tra kết nối hệ thống
        </Link>
        <span aria-hidden>·</span>
        <span>Nền móng đã dựng xong, chưa có màn hình nghiệp vụ</span>
      </footer>
    </main>
  )
}
