# AGENTS.md — Nguồn chân lý cho mọi AI agent làm việc trên kios-xm

> File này là **nguồn chân lý duy nhất**. `CLAUDE.md` và `GEMINI.md` chỉ trỏ về đây.
> Claude Code và Antigravity **cùng đọc file này** trước khi làm bất cứ việc gì.

---

## 0. Đọc gì trước khi bắt đầu (bắt buộc, theo thứ tự)

1. `AGENTS.md` (file này) — quy tắc chung
2. `PROGRESS.md` — đang làm tới đâu, ai đang giữ việc gì
3. `TASKS.md` — hàng đợi công việc + phân công
4. `docs/research/` — nghiên cứu nghiệp vụ (KHÔNG sửa, chỉ đọc)
5. `docs/decisions/` — các quyết định kiến trúc đã chốt (ADR)

## 1. Dự án là gì

Xây dựng **kios-xm** — phần mềm quản lý spa/thẩm mỹ viện hoàn chỉnh, thay thế
KiotViet Salon mà chủ dự án đang thuê bao.

- **Chủ dự án**: anh Khôi (`khoibm.tn@gmail.com`)
- **Repo**: https://github.com/khoibmtn/kios-xm
- **Triển khai**: Vercel
- **Ngôn ngữ giao tiếp**: tiếng Việt. Code/tên biến/commit message: tiếng Anh.

## 2. Stack đã chốt

| Lớp | Lựa chọn |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| CSS | **Tailwind CSS** (bắt buộc — yêu cầu của chủ dự án) |
| UI primitives | shadcn/ui (Radix) |
| DB | PostgreSQL (Neon/Supabase) |
| ORM | Prisma |
| Auth | Auth.js (credentials + OTP điện thoại) |
| Lịch hẹn | FullCalendar (React) |
| Bảng dữ liệu | TanStack Table |
| Form | react-hook-form + zod |
| State máy chủ | TanStack Query |
| Deploy | Vercel |

**Ràng buộc thiết kế**: tối ưu **cả desktop và điện thoại**.
- POS/Lịch hẹn: ưu tiên tablet ngang + điện thoại, nút ≥ 44px.
- Quản trị: desktop-first nhưng bảng phải xuống được dạng thẻ (card) trên mobile.

## 3. Quy ước code

- Thư mục: `app/` (routes) · `components/` · `lib/` · `server/` (actions, services) ·
  `prisma/` · `docs/`
- Tên bảng/cột DB: `snake_case` tiếng Anh. Nhãn hiển thị: tiếng Việt (qua `lib/labels.ts`).
- Tiền tệ: lưu `numeric`, không dùng float. Hiển thị `vi-VN`, đơn vị VND, không số lẻ.
- Thời gian: lưu `timestamptz` UTC, hiển thị theo `Asia/Ho_Chi_Minh`.
- Mọi bảng nghiệp vụ có `tenant_id` + `branch_id`.
- Component: PascalCase; hook: `useXxx`; server action: `xxxAction`.
- Không commit secret. Biến môi trường khai trong `.env.example`.

## 4. Quy tắc phối hợp Claude Code ⇄ Antigravity

### 4.1 Nguyên tắc vàng
> **Một task — một agent — một nhánh.** Không hai agent cùng sửa một file.

### 4.2 Trước khi làm
1. Mở `TASKS.md`, tìm task ở trạng thái `TODO`.
2. Đổi trạng thái thành `DOING` **và ghi tên agent + thời gian** vào cột `Owner`.
3. Commit ngay thay đổi `TASKS.md` đó (commit riêng, message `chore(tasks): claim T-xx`).
   → Đây là cách "khoá" task để agent kia không giành.

### 4.3 Sau khi làm xong
1. Đổi trạng thái `DONE`, ghi commit hash.
2. Cập nhật `PROGRESS.md`: thêm 1 dòng vào nhật ký (ngày · agent · việc đã xong · file đụng tới).
3. Nếu phát sinh quyết định kiến trúc → tạo `docs/decisions/ADR-xxx.md`.

### 4.4 Phân công mặc định
| Loại việc | Giao cho |
|---|---|
| Kiến trúc, schema DB, nghiệp vụ phức tạp (lịch hẹn, hoa hồng, gói/thẻ, kho) | **Claude Code** |
| Component UI đơn lẻ, trang tĩnh, form CRUD đơn giản, sửa style, viết test | **Antigravity** |
| Nghiên cứu nghiệp vụ, tài liệu, ADR | **Claude Code** |

### 4.5 Không được làm nếu chưa hỏi chủ dự án
- Đổi stack đã chốt ở §2
- `git push` lần đầu lên remote, tạo PR, hoặc force push
- Xoá file trong `docs/research/`
- Cài thêm dependency nặng (>1 lib mới cho 1 task)
- Chạy migration phá huỷ dữ liệu

## 5. Ranh giới an toàn khi khảo sát KiotViet

Chủ dự án có tài khoản KiotViet Salon thật, đăng nhập sẵn trên Chrome.
Khi cần khảo sát thêm:
- **Chỉ đọc.** Không tạo/sửa/xoá dữ liệu thật.
- ⚠️ Cạm bẫy đã gặp: gán khung giờ cho dòng dịch vụ trong POS sẽ **tự tạo lịch hẹn thật**.
  Nếu lỡ tạo, phải huỷ ngay và ghi lại vào `PROGRESS.md`.
- Không bấm "Thanh toán", "Lưu", "Xoá" trên dữ liệu thật.

## 6. Định nghĩa "xong" (Definition of Done)

Một task chỉ được đánh `DONE` khi:
1. Code chạy được (`pnpm build` không lỗi).
2. Đúng **tất cả** tiêu chí nghiệm thu ghi trong task.
3. Responsive: kiểm tra ở 375px, 768px, 1440px.
4. Tiếng Việt đúng chính tả, có dấu.
5. Đã cập nhật `TASKS.md` + `PROGRESS.md`.
