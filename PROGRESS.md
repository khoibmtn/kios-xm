# PROGRESS — Nhật ký tiến độ

> Mỗi agent (Claude Code / Antigravity) **thêm một dòng vào bảng Nhật ký** sau khi hoàn thành
> một task. Không xoá dòng cũ. Ghi rõ file đã đụng tới để agent kia biết mà tránh.

## Trạng thái hiện tại

| Mục | Giá trị |
|---|---|
| Milestone đang làm | **M1 — Danh mục** (M0 xong phần Claude, còn 4 task giao diện của Antigravity) |
| Giai đoạn | Đã xong nghiên cứu, chờ anh Khôi chốt Q1–Q5 trong `TASKS.md` |
| Ứng dụng đã deploy | **Có, chạy đầy đủ** — https://kios-xm.spa-xumay.workers.dev |
| Schema DB | **24 bảng trên Supabase** — M0 (13) + danh mục M1 (10), đã seed dữ liệu mẫu |
| Số task DONE | 12 / 21 (M0+M1) — thêm T-10, T-11 |

## Nhật ký

| Ngày | Agent | Việc đã xong | File đụng tới |
|---|---|---|---|
| 2026-09-05 | Claude Code | Khảo sát trực tiếp KiotViet Salon (tài khoản thật): bản đồ 40+ màn hình, schema API sản phẩm/khách hàng, luồng POS & lịch hẹn, toàn bộ trang Thiết lập | `docs/research/01-module-map.md`, `02-data-model.md`, `03-ux-flows.md`, `04-business-rules.md` |
| 2026-09-05 | Claude Code | Thiết lập context dùng chung cho 2 agent + kiến trúc + lộ trình M0–M10 | `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `TASKS.md`, `PROGRESS.md`, `docs/architecture/01-overview.md` |
| 2026-09-05 | Claude Code | Khảo sát sâu đợt 2: 4 form tạo hàng hoá, lương/chấm công/bảng lương, nhập hàng & kiểm kho, khuôn mẫu báo cáo, giải phẫu hoá đơn thật (HD000586) | `docs/research/05-product-forms.md`, `06-employees-inventory-reports.md`, `07-invoice-anatomy.md` |
| 2026-09-05 | Claude Code | Thiết kế tổng thể v1 để duyệt: 12 phân hệ, 4 bề mặt, 5 mẫu màn hình, 7 luồng nghiệp vụ, 12 bất biến | `docs/architecture/02-system-design.md` |
| 2026-09-05 | Claude Code | **Phản biện chéo + sửa 3 lỗi kiến trúc** (employees/users, booking↔invoice, phân bổ giá gói); chốt hạ tầng chi phí tối thiểu + Google Drive | `docs/decisions/ADR-001`, `ADR-002`, `AGENTS.md`, `02-data-model.md`, `TASKS.md` |
| 2026-09-05 | Claude Code | Nhận thông tin OAuth + Drive từ anh Khôi. Chặn `client_secret*.json` khỏi git, tạo `env.example` và `.env.local` (chmod 600). Phát hiện `drive.file` không ghi được vào thư mục có sẵn → ứng dụng sẽ tự tạo thư mục gốc | `.gitignore`, `env.example`, `ADR-002 §2.2` |
| 2026-09-05 | Claude Code | Cấu hình xong Google Cloud (scope `drive.file`, redirect URI, 2 test users) và lấy chuỗi kết nối Supabase (Tokyo). Publish OAuth app còn vướng vì chưa có tên miền | `ADR-002 §2.6, §3.5`, `.env.local` |
| 2026-09-05 | Claude Code | **T-01 + T-03 xong**: Next.js 16 + Tailwind 4 + font Be Vietnam Pro, Prisma 7 + Supabase (13 bảng), 43 quyền chi tiết + 5 vai trò, seed spa/chi nhánh/chủ. `npm run build` sạch, `/api/health` báo DB ok | `app/`, `lib/`, `prisma/`, `package.json` |
| 2026-09-05 | Claude Code | **T-04 + T-18 xong**: Auth.js v5 (JWT 12h, session mang tenant/branch/quyền), trang đăng nhập, chặn route, trang 403, `audit_log` service. Kiểm chứng thật: lễ tân chỉ 14/43 quyền, thấy cảnh báo y tế nhưng không mở được chẩn đoán | `auth.ts`, `auth.config.ts`, `proxy.ts`, `app/login/`, `app/admin/`, `lib/auth/`, `lib/audit.ts` |
| 2026-09-05 | Claude Code | **T-17 xong**: kết nối Google Drive thật (tài khoản Xumây Hương, còn ~1.790 GB). Kiểm chứng đầu-cuối: tải ảnh lên → ghi bảng `files` → đọc lại khớp từng byte → xoá sạch | `lib/storage/`, `lib/crypto.ts`, `app/api/drive/`, `scripts/check-storage.ts` |
| 2026-09-05 | Claude Code | **T-09 xong**: deploy Cloudflare Workers thành công. Gặp bug Prisma 7 + WASM → **đổi ORM sang Drizzle** (ADR-003), lược đồ đọc ngược từ CSDL đang chạy nên không mất dữ liệu. Production kiểm chứng: đăng nhập + phân quyền 14/43 của lễ tân đều đúng | `lib/schema/`, `lib/db.ts`, `auth.ts`, `scripts/seed.ts`, `wrangler.jsonc`, `ADR-003` |
| 2026-09-05 | Claude Code | **T-07 + T-08 xong**: `DataTable` dùng chung (lọc, sắp xếp, tuỳ chỉnh cột, xuất CSV cho Excel VN, phân trang, tự chuyển dạng thẻ trên điện thoại) + `lib/format.ts`. Kiểm chứng bằng **2 màn hình thật** trên production: Nhân viên và Nhật ký thao tác | `components/data-table/`, `lib/format.ts`, `app/admin/employees/`, `app/admin/audit/` |
| 2026-09-05 | Claude Code | **T-19 xong, T-20 chờ secrets**: hộp thư đi có trạng thái `processing` chống mất việc khi tiến trình chết, `FOR UPDATE SKIP LOCKED` chống gửi trùng, thử lại tối đa 5 lần. Kiểm chứng production: 3 việc → 2 gửi, 1 hỏng; chạy lại claimed=0. Sao lưu chuyển sang GitHub Actions vì `pg_dump` không chạy trên Workers | `lib/outbox.ts`, `app/api/cron/outbox/`, `scripts/backup.ts`, `.github/workflows/` |
| 2026-09-05 | Claude Code | **T-20 xong**: sao lưu tự động lên Drive 02:00 hằng ngày, giữ 30 bản, **kèm khôi phục thử vào Postgres trống mỗi lượt chạy** — đối chiếu số bản ghi khớp 5/5 bảng. Cron 15 phút chạy hộp thư đi và giữ nhịp chống Supabase tạm dừng. Đã nạp 6 GitHub secrets | `.github/workflows/`, `scripts/backup.ts`, `scripts/verify-backup.ts` |
| 2026-09-05 | Claude Code | **T-10 + T-11 xong**: lược đồ danh mục 4 loại hàng hoá với **14 ràng buộc cấp CSDL** (dịch vụ buộc có thời lượng, thẻ buộc có mệnh giá, gói chỉ chứa dịch vụ, định mức chỉ tiêu hao sản phẩm…) — kiểm chứng 14/14 chặn đúng. Seed 14 hàng hoá theo dữ liệu thật. Trang Hàng hoá chạy trên production, giá vốn bị cắt từ truy vấn với người không có quyền | `lib/schema/catalog.ts`, `drizzle/0003_catalog.sql`, `app/admin/products/`, `scripts/seed-catalog.ts`, `scripts/check-catalog-rules.ts` |
| 2026-09-05 | Claude Code | **Logic phân bổ giá gói** (ADR-001 §1.3) + 7 kiểm thử: phân bổ theo tỷ trọng giá lẻ, dồn phần dư khi làm tròn để tổng luôn khớp giá gói, lùi về chia đều khi thiếu giá lẻ, cảnh báo khi gói đắt hơn mua rời. Trang chi tiết hàng hoá hiển thị bảng phân bổ, định mức NVL, tồn kho | `lib/catalog/package-allocation.ts` + test, `app/admin/products/[id]/` |
| 2026-09-05 | Claude Code | **T-12 xong**: form thêm/sửa hàng hoá cho cả 4 loại, mã tự sinh theo tiền tố, xem trước phân bổ gói ngay khi gõ. Đã tạo và sửa một gói 2 dịch vụ **thật trên bản triển khai** — con số phân bổ trên form khớp đúng trang chi tiết, nhật ký ghi cả `create` lẫn `update`; dữ liệu thử đã dọn sau khi nghiệm thu. Thêm 12 kiểm thử schema | `app/admin/products/{product-form,actions,form-data}.tsx`, `lib/catalog/product-schema.ts` + test, `components/form/fields.tsx` |

## Sự cố / bài học

| Ngày | Nội dung |
|---|---|
| 2026-09-05 | **Cạm bẫy khi khảo sát:** trong POS KiotViet, gán khung giờ cho một dòng dịch vụ sẽ **tạo ngay một lịch hẹn thật** (toast "Tạo lịch hẹn thành công") dù hoá đơn chưa thanh toán. Khi khảo sát đã lỡ tạo 1 lịch hẹn thử và **đã huỷ ngay** (dialog "Huỷ dịch vụ" + lý do); lịch hẹn về `Tổng số 0`. → Ghi vào `AGENTS.md` §5 làm quy tắc: chỉ đọc, không thao tác gán giờ trên dữ liệu thật. |
| 2026-09-05 | Giao diện quản trị KiotViet nằm trong **Shadow DOM** — công cụ đọc DOM thường không thấy. Muốn khảo sát tiếp phải duyệt xuyên `shadowRoot`. |
| 2026-09-05 | **Bài học thiết kế:** bản thiết kế v1 có 3 lỗi kiến trúc chỉ lộ ra khi bị phản biện chéo — (1) tự mâu thuẫn giữa phần văn xuôi và data model về `employees` vs `users`; (2) lặp 5 trường ở cả `booking_items` lẫn `invoice_items` tạo hai nguồn sự thật; (3) công thức phân bổ giá gói chỉ đúng với gói một dịch vụ. ⇒ Sau này mỗi khi viết văn xuôi khẳng định một nguyên tắc, phải **kiểm tra lại data model có tuân đúng không**. |
| 2026-09-05 | **Yêu cầu phi chức năng phải đối chiếu gói dịch vụ thật.** Tôi viết "sao lưu 30 ngày + khôi phục theo thời điểm" mà không kiểm tra: Supabase Free **không có backup**, Pro chỉ giữ 7 ngày, PITR là tính năng trả thêm tiền. |
| 2026-09-05 | **Vercel Hobby cấm dùng thương mại** — suýt chọn nhầm hạ tầng vi phạm điều khoản. **Google Drive service account có hạn mức 0 GB** từ 2023 — phải dùng OAuth tài khoản thật. Cả hai đều không tự lộ ra nếu không tra cứu. |

| 2026-09-05 | **Auth.js v5 tự host**: mặc định chỉ tin Host header khi chạy trên Vercel; tự host phải đặt `trustHost: true`, nếu không mọi request đều `UntrustedHost`. **Next 16** đã đổi quy ước `middleware.ts` → `proxy.ts`. **Module augmentation của next-auth** không ăn với `AdapterUser`/`JWT` trong bản beta hiện tại — phải khai kiểu tường minh rồi ép kiểu trong callback. |

| 2026-09-05 | **Prisma 7 chưa chạy được trên Cloudflare Workers.** Client sinh ra biên dịch WASM lúc chạy, mà Workers cấm (`Wasm code generation disallowed by embedder`). Đã thử generator `prisma-client` với `runtime="workerd"` + `moduleFormat="esm"` — vẫn lỗi, vì OpenNext nhúng WASM dạng base64 khi đóng gói nên không còn là import tĩnh. Đây là bug đã biết của Prisma (issue 28657), chưa có bản vá. Ứng dụng **đã deploy và phục vụ được**; chỉ phần truy vấn cơ sở dữ liệu hỏng. → **Đã xử lý bằng cách đổi sang Drizzle**, xem `ADR-003`. |

| 2026-09-05 | **Bài học nền tảng:** chốt Prisma trong `AGENTS.md` và chốt Cloudflare trong `ADR-002` ở hai thời điểm khác nhau, không ai kiểm chứng hai thứ chạy cùng nhau. Xung đột chỉ lộ ra sau khi đã viết xong xác thực, phân quyền và lưu trữ. ⇒ **Deploy thử ngay sau khi dựng xong nền móng**, đừng đợi tới lúc có nhiều tính năng. |

| 2026-09-05 | **Ba cái bẫy khi deploy lên Workers**: (1) `opennextjs-cloudflare deploy` **không tự build lại** — chạy `next build` rồi deploy sẽ đẩy bundle cũ, route mới trả 404. Đã gộp build vào script `cf:deploy`. (2) **Không được giữ connection pool dùng chung** giữa các request: Worker bị đóng băng giữa các lần gọi, kết nối TCP đứt, request sau ném `Error 1101`. Phải tạo kết nối theo từng request (`maxUses: 1` + React `cache()`). (3) **TanStack Table v9** tuy là bản ổn định mới nhất nhưng đổi hẳn sang mô hình atoms/features, rất ít ví dụ thực tế — đã ghim **v8.21.3** cho chắc. |

| 2026-09-05 | **Cột `id` thiếu DEFAULT sau khi rời Prisma.** Prisma sinh UUID ở tầng ứng dụng nên cơ sở dữ liệu không có `DEFAULT`; Drizzle gửi từ khoá `DEFAULT` khi chèn nên vi phạm NOT NULL. Đã chạy `0002_uuid_defaults.sql` đặt `gen_random_uuid()` cho cả 10 bảng. Bài học: khi đổi ORM, phải kiểm tra cả những mặc định vốn nằm ở tầng ứng dụng. |

| 2026-09-05 | **Bốn lỗi của form hàng hoá, không lỗi nào build hay `tsc` bắt được — chỉ lộ ra khi thao tác thật trên bản triển khai.** (1) Server component `import { EMPTY_FORM }` từ file có `'use client'`: React chỉ đưa về một *client reference* rỗng chứ không phải giá trị thật, nên `{...EMPTY_FORM}` ra object thiếu gần hết trường và trang đổ ngay lúc render. ⇒ **Hằng số dùng chung giữa hai phía phải nằm ở module trung tính**, không có `'use client'`. (2) Ô không được vẽ ra thì **vắng mặt hẳn** trong FormData chứ không phải chuỗi rỗng — `brandId` chỉ hiện với loại "sản phẩm", khiến gói/dịch vụ/thẻ **không bao giờ lưu được**, mà lỗi lại nằm ở ô người dùng không nhìn thấy. (3) `z.coerce.number()` biến chuỗi rỗng thành **0**: "chưa khai tồn tối thiểu" bị ghi thành 0. (4) **React 19 tự reset form** sau khi server action chạy xong; `<input>` được React ghi lại giá trị nhưng `<select>` thì không — submit hỏng một ô là mọi ô chọn trông như trống. ⇒ Bài học chung: **form phải được bấm thử thật trên bản triển khai**, đọc code không thấy được nhóm lỗi này. |
| 2026-09-05 | **Suýt sai tiền gấp trăm lần.** `numeric` của Postgres trả về chuỗi `"500000.00"`; người Việt lại dùng dấu chấm để ngăn nghìn, nên hàm gỡ dấu chấm biến 500 nghìn thành 50 triệu. Màn hình vẫn hiện đúng "500.000" vì `Number("500000.00")` ở trình duyệt ra đúng — chỉ giá trị **ghi xuống cơ sở dữ liệu** mới sai. Đã sửa ở hai tầng: chuẩn hoá về số nguyên ngay khi đọc ra khỏi CSDL, và schema **từ chối thẳng** chuỗi có phần thập phân thay vì đoán ý. ⇒ Bất cứ chỗ nào chuỗi tiền đi qua ranh giới CSDL ↔ giao diện đều phải kiểm tra định dạng, đừng tin `Number()`. |
| 2026-09-05 | **Bốn cái bẫy khi dựng CI**: (1) `npm ci` từ chối chạy vì lock sinh trên macOS thiếu optional dependency của Linux (`@emnapi/*`) — đổi sang `npm install` cho job chạy ngày một lần. (2) Ubuntu có sẵn `pg_dump` 16 đứng trước trong PATH, mà `pg_dump` từ chối chạy với máy chủ mới hơn (17.6) — phải trỏ thẳng `/usr/lib/postgresql/17/bin`. (3) Lỗi `execFile` chỉ nói "Command failed" và che chuỗi kết nối — phải tự lấy `stderr` mới biết nguyên nhân. (4) `env.example` để `GOOGLE_REFRESH_TOKEN=""`, mà `??` chỉ bắt null/undefined nên chuỗi rỗng lọt qua — dùng `||`. |

## Ghi chú kỹ thuật cần nhớ

- Hai bề mặt tách biệt: `(pos)` và `(admin)` — xem `docs/architecture/01-overview.md`.
- Bốn loại hàng hoá là trục thiết kế xuyên suốt: `product` · `service` · `package` · `card`.
- Mỗi dòng dịch vụ có **2 vai trò hoa hồng**: `performer` (làm) và `consultant` (tư vấn).
- Ràng buộc chống trùng lịch nên đặt ở tầng Postgres (`EXCLUDE USING gist`), không ở app.
- Thực ra có **3** vai trò hoa hồng, không phải 2: `Thực hiện dịch vụ` · `Tư vấn bán hàng`
  · `Thu ngân` (xác nhận qua bộ chỉ tiêu của Báo cáo nhân viên).
- Thanh toán hoá đơn **luôn sinh phiếu thu trong sổ quỹ** (mã `TT` + mã hoá đơn).
- Chứng từ kho theo mẫu **phiếu tạm → hoàn tất**; chỉ khi hoàn tất mới ghi `stock_moves`.
- Hoá đơn tổng tiền `0` là hợp lệ (dùng buổi từ gói / trả bằng thẻ) — không được coi là lỗi.
