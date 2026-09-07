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
- **Triển khai**: Cloudflare Workers — https://kios-xm.spa-xumay.workers.dev
- **Ngôn ngữ giao tiếp**: tiếng Việt. Code/tên biến/commit message: tiếng Anh.

## 2. Stack đã chốt

| Lớp | Lựa chọn |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| CSS | **Tailwind CSS** (bắt buộc — yêu cầu của chủ dự án) |
| UI primitives | shadcn/ui (Radix) |
| DB | **Supabase Free** — dùng như PostgreSQL có quản lý (không dùng RLS/Edge Function độc quyền) |
| ORM | **Drizzle** — Prisma không chạy được trên Workers, xem [`ADR-003`](./docs/decisions/ADR-003-drizzle.md) |
| Auth | Auth.js (credentials + OTP điện thoại) |
| **Lưu trữ tệp** | **Google Drive** (2 TB của anh Khôi) qua `StorageAdapter` |
| Lịch hẹn | FullCalendar (React) |
| Bảng dữ liệu | TanStack Table |
| Form | react-hook-form + zod |
| State máy chủ | TanStack Query |
| Deploy | **Cloudflare Workers** (Free khi dev → Paid 5 $ khi chạy thật) |

> ⚠️ **Không dùng Vercel.** Gói Hobby cấm dùng cho mục đích thương mại; spa là kinh doanh
> nên vi phạm điều khoản. Chi tiết: [`ADR-002`](./docs/decisions/ADR-002-infrastructure.md).

**Mục tiêu chi phí**: 0 đ khi phát triển · ≈ 130.000 đ/tháng khi vận hành thật.

**Ràng buộc thiết kế**: tối ưu **cả desktop và điện thoại**.
- POS/Lịch hẹn: ưu tiên tablet ngang + điện thoại, nút ≥ 44px.
- Quản trị: desktop-first nhưng bảng phải xuống được dạng thẻ (card) trên mobile.

## 3. Quy ước code

- Thư mục: `app/` (routes) · `components/` · `lib/` (gồm `lib/schema/` — lược đồ CSDL) ·
  `server/` (actions, services) · `drizzle/` (migration SQL) · `scripts/` · `docs/`
- Tên bảng/cột DB: `snake_case` tiếng Anh. Nhãn hiển thị: tiếng Việt (qua `lib/labels.ts`).
- Tiền tệ: lưu `numeric`, không dùng float. Hiển thị `vi-VN`, đơn vị VND, không số lẻ.
- Thời gian: lưu `timestamptz` UTC, hiển thị theo `Asia/Ho_Chi_Minh`.
- Mọi bảng nghiệp vụ có `tenant_id` + `branch_id`.
- Component: PascalCase; hook: `useXxx`; server action: `xxxAction`.
- Không commit secret. Biến môi trường khai trong `env.example`.
- ⚠️ Không commit `.open-next/` và `.wrangler/` — thư mục build có nhúng biến môi trường.

## 3c. NĂM CÁI BẪY ĐÃ CẮN THẬT

Tất cả đều lọt qua TypeScript, `next build` và kiểm thử đơn vị; chỉ lộ ra khi
bấm thử trên bản đã triển khai. Đọc kỹ trước khi viết form hay server action.

1. **Migration chạy qua `npm run db:migrate`, không chạy tay.** Áp theo thứ tự
   tên, mỗi tệp một giao dịch, ghi lịch sử vào bảng `applied_migrations`. Sau
   bất kỳ thay đổi lược đồ nào, chạy `npm run db:check` để đối chiếu lược đồ
   Drizzle với cơ sở dữ liệu thật — nó bắt cả tên cột lệch lẫn cột NOT NULL
   thiếu DEFAULT.
2. **`.defaultNow()` của Drizzle chỉ dùng khi sinh DDL.** Lúc chạy, Drizzle gửi
   từ khoá `DEFAULT` cho cột không truyền giá trị; cột NOT NULL mà cơ sở dữ
   liệu không có DEFAULT thật thì câu chèn hỏng. Mặc định phải nằm trong CSDL.
3. **File `'use server'` chỉ chứa action thật.** Mọi export của module đó đều
   thành điểm gọi được từ trình duyệt — một hàm phụ trợ nhận `tenantId` và
   không kiểm tra quyền là cửa đọc dữ liệu của spa khác. Hàm trợ giúp render
   để ở module thường.
4. **Hằng số dùng chung giữa server và client phải ở module trung tính.** Server
   component import giá trị từ file có `'use client'` chỉ nhận về một *client
   reference* rỗng, không phải giá trị thật — `{...HANG_SO}` sẽ ra object
   thiếu trường và trang đổ lúc render.
5. **FormData: ô để trống là chuỗi rỗng, ô không được vẽ ra thì vắng mặt hẳn.**
   `z.coerce.number()` biến `''` thành `0` (ghi 0 vào ô "chưa khai"), còn
   trường vắng mặt làm `z.string()` báo lỗi ở ô người dùng không nhìn thấy —
   màn hình chỉ hiện "kiểm tra lại các ô được đánh dấu" mà chẳng ô nào đỏ. Mọi
   trường không bắt buộc phải `.optional()` và quy chuỗi rỗng về `undefined`.

## 3b. BẢY QUY TẮC DATA MODEL KHÔNG ĐƯỢC VI PHẠM

Rút ra từ phản biện chéo ([`ADR-001`](./docs/decisions/ADR-001-design-revisions.md)).
Vi phạm những điều này sẽ phải migrate lại dữ liệu thật về sau.

1. **Ghi nhận nghiệp vụ trỏ `employees`, ghi nhận thao tác trỏ `users`.**
   `performer` / `consultant` / `cashier` → `employees.id`.
   `created_by_user_id` / `updated_by_user_id` → `users.id`. Không lẫn lộn.
2. **Dịch vụ luôn sinh `booking_item`**, kể cả khách vãng lai làm ngay.
   `invoice_items.booking_item_id` là liên kết chính thức (UNIQUE).
   Thời gian + phòng: nguồn sự thật ở `booking_item`. Giá + giảm giá: ở `invoice_item`.
3. **Nhiều người cùng làm một dịch vụ** → bảng `invoice_item_employees`
   (`role`, `contribution_ratio`). Không nhét mảng vào một cột.
4. **Giá trị buổi trong gói** phân bổ theo **tỷ trọng giá bán lẻ**, lưu snapshot khi bán.
   Không bao giờ tính lại từ giá hiện hành.
5. **Ba chỉ tiêu tiền phải tách bạch**: `sale_amount` (tiền khách trả) ·
   `service_allocated_value` (giá trị buổi dùng từ gói) · `commission_base`.
   Dashboard doanh thu **chỉ** cộng `sale_amount`.
6. **Mọi thay đổi số buổi / số dư đi qua ledger** (`package_transactions`,
   `card_transactions`). Cấm UPDATE trực tiếp `used_sessions` hay `balance`.
   `customers.debt`, `cash_accounts.balance` chỉ là **giá trị cache**, tính lại được.
7. **`commission_entries` lưu snapshot của rule** (`calc`, `value`, `base_amount`).
   Sửa bảng hoa hồng trong tương lai không được làm đổi hoa hồng lịch sử.

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
- **Dùng cửa sổ Chrome đang mở, đừng mở cửa sổ/hồ sơ mới.** Cửa sổ mới không mang
  theo phiên đăng nhập, KiotViet đá về trang login và chủ dự án phải đăng nhập lại.
- Việc **xuất Excel do chủ dự án tự bấm** (agent chỉ tìm và chỉ chỗ): hộp thoại chọn
  thư mục tải xuống nằm ngoài tầm với của agent. Tệp xuất xong được gom vào
  `.local-data/`.
- ⚠️ Bộ lọc mặc định của KiotViet **giấu bớt dòng khi xuất tệp** (Hàng hoá mặc định
  "Đang kinh doanh"; nhiều màn hình mặc định "Hôm nay"/"Tháng này"). Trước khi tin
  một tệp xuất, đối chiếu số dòng với con số hiển thị trên màn hình.

## 6. Định nghĩa "xong" (Definition of Done)

Một task chỉ được đánh `DONE` khi:
1. Code chạy được (`npm run build` không lỗi).
2. Đúng **tất cả** tiêu chí nghiệm thu ghi trong task.
3. Responsive: kiểm tra ở 375px, 768px, 1440px.
4. Tiếng Việt đúng chính tả, có dấu.
5. Đã cập nhật `TASKS.md` + `PROGRESS.md`.
