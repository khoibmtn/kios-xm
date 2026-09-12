# TASKS — Hàng đợi công việc

> **Quy tắc claim task** (bắt buộc, xem `AGENTS.md` §4):
> 1. Chọn task `TODO` đúng cột `Agent` của mình
> 2. Đổi `Status` → `DOING`, điền `Owner` = tên agent + ngày giờ
> 3. Commit riêng file này: `chore(tasks): claim T-xx`
> 4. Làm xong → `DONE` + ghi commit hash + thêm dòng vào `PROGRESS.md`
>
> Trạng thái: `TODO` · `DOING` · `BLOCKED` · `REVIEW` · `DONE`
> Agent: `Claude` · `Antigravity` · `Any`

---

## Milestone M0 — Nền móng

| ID | Việc | Agent | Status | Owner | Tiêu chí nghiệm thu |
|---|---|---|---|---|---|
| T-01 | Khởi tạo Next.js + TypeScript + Tailwind + ESLint/Prettier | Claude | DONE | Claude 05/09 | `pnpm dev` chạy; Tailwind áp dụng được; `pnpm build` sạch |
| T-02 | Cài shadcn/ui, thiết lập design token (màu, spacing, font Inter/Be Vietnam Pro) | Antigravity | DONE | Claude 05/09 | Đủ `Button`/`Input`/`Dialog`/`Sheet`/`Table`/`Badge`. **Không chạy `shadcn init`** — nó ghi đè `globals.css` đang có bộ token teal và sẽ dựng hệ thứ hai song song với các component đã chạy thật. Chỉ thêm phần còn thiếu (Button, Dialog, Sheet trên Radix) dùng đúng token cũ |
| T-03 | Prisma + Supabase Postgres, schema M0: tenants, branches, users, roles, user_branch_roles, tenant_features, tenant_settings, files, outbox_events, audit_log | Claude | DONE | Claude 05/09 | `prisma migrate dev` chạy; seed 1 tenant + 1 chi nhánh + 1 owner |
| T-04 | Auth.js: đăng nhập email/mật khẩu, session mang `tenantId` + `branchId` | Claude | DONE | Claude 05/09 | Đăng nhập/đăng xuất; route `(admin)` chặn khi chưa đăng nhập |
| T-05 | Layout Quản trị: topbar + sidebar theo cây menu trong `docs/research/01-module-map.md` | Antigravity | DONE | Claude 05/09 | Đủ nhóm menu; thu gọn được; mobile có drawer; active state đúng |
| T-06 | Layout POS: header 2 tab (Lịch hẹn / Bán hàng), không sidebar | Antigravity | DONE | Claude 05/09 | Chạy tốt ở 1024×768 ngang và 375px |
| T-07 | Component `DataTable` dùng chung (TanStack Table): sidebar lọc + bảng + dòng tổng + phân trang + tuỳ chỉnh cột + xuất file | Claude | DONE | Claude 05/09 | Dùng lại được cho ≥2 module; mobile tự chuyển sang dạng thẻ |
| T-08 | Chuẩn hoá tiền tệ/ngày giờ: `lib/format.ts` (VND, `vi-VN`, `Asia/Ho_Chi_Minh`) | Claude | DONE | Claude 05/09 — chuyển từ Antigravity vì T-07 phụ thuộc | `formatMoney(1500000)` → `1.500.000`; test đơn vị |
| T-09 | Deploy Cloudflare Workers + Supabase Free, biến môi trường, `env.example` | Claude | DONE | Claude 05/09 | URL production mở được trang đăng nhập |
| T-17 | `StorageAdapter` + `GoogleDriveAdapter` (OAuth `drive.file`, refresh token mã hoá) + bảng `files` | Claude | DONE | Claude 05/09 | Upload 1 ảnh lên Drive của anh Khôi, đọc lại qua endpoint có kiểm tra quyền |
| T-18 | RBAC chi tiết: quyền theo module × hành động + 4 quyền y tế theo tầng + `audit_log` | Claude | DONE | Claude 05/09 | Lễ tân thấy ⚠ cảnh báo y tế nhưng không mở được chẩn đoán; mọi lần xem hồ sơ y tế đều có log |
| T-19 | `outbox_events` + worker gửi (GitHub Actions cron) | Claude | DONE | Claude 05/09 | Ghi sự kiện trong transaction, worker gửi sau commit, có retry, không gửi trùng |
| T-20 | Cron sao lưu: `pg_dump` → nén → Google Drive `/backups`, giữ 30 bản + ping chống pause + **khôi phục thử tự động** | Claude | DONE | Claude 05/09 | Chạy 3 ngày liên tiếp có 3 file; khôi phục thử thành công |
| T-21 | `tenant_settings` + `tenant_features` (slot 15/30/60, buffer, chế độ phân bổ gói, khoá sổ) | Antigravity | DONE | Claude 05/09 | Màn hình cấu hình lưu đủ 6 thiết lập + 4 cờ tính năng, đổi khoá sổ/phân bổ gói có ghi nhật ký. **Phần "lịch hẹn hiển thị đúng" phải đợi M2** — chưa có lưới để nhìn |

## Milestone M1 — Danh mục

| ID | Việc | Agent | Status | Owner | Tiêu chí nghiệm thu |
|---|---|---|---|---|---|
| T-10 | Schema danh mục: categories, brands, products (4 `kind`), variants, package_items, service_materials | Claude | DONE | Claude 05/09 | Migrate sạch; ràng buộc `kind` đúng; seed dữ liệu mẫu |
| T-11 | Trang Danh sách hàng hoá: bảng + sidebar lọc (loại, nhóm, thương hiệu, tồn kho, trạng thái) | Claude | DONE | Claude 05/09 | Lọc hoạt động; badge màu theo `kind`; phân trang |
| T-12 | Form thêm/sửa hàng hoá — tab theo `kind` (Sản phẩm / Dịch vụ / Gói / Thẻ) | Claude | DONE | Claude 05/09 | Đã tạo + sửa thật một gói 2 dịch vụ trên bản triển khai: mã tự sinh, xem trước phân bổ khớp trang chi tiết, nhật ký ghi cả `create` lẫn `update` |
| T-13 | Quản lý nhóm hàng (cây) + thương hiệu + đơn vị tính | Antigravity | DONE | Claude 05/09 | CRUD đủ; nhóm hàng nhiều cấp |
| T-14 | Vị trí/phòng + nhóm vị trí | Antigravity | DONE | Claude 05/09 | CRUD; trường: tên, ghi chú, nhóm, trạng thái, số thứ tự |
| T-15 | Nhân viên: CRUD + phòng ban + chức danh | Any | DONE | Claude 05/09 | Đã thêm + sửa + cho nghỉ việc một hồ sơ thật trên bản triển khai; phòng ban/chức danh tạo nhanh ngay trong form; nhật ký ghi rõ "Ngừng làm việc từ …" |
| T-23 | Đọc được cả hai phương ngữ .xlsx của KiotViet (thẻ tiền tố `x:`, chuỗi thẳng trong `<x:v>`, không có `sharedStrings.xml`, **không có toạ độ `r=`**) | Claude | DONE | Claude 07/09 | `lib/catalog/xlsx-min.ts` — bộ đọc riêng, giải nén bằng `DecompressionStream` có sẵn, không thêm thư viện. Đọc đúng **cả 4 bản xuất thật, cả hai phương ngữ**: nhân viên 1 dòng, hoa hồng 237, khách hàng 81, thẻ dịch vụ 19. 9 kiểm thử cho phần XML→lưới |
| T-22 | Cấp tài khoản đăng nhập cho nhân viên + gán vai trò theo chi nhánh (`user_branch_roles`) | Claude | TODO | | Tạo tài khoản từ hồ sơ nhân viên, đặt mật khẩu ban đầu, đăng nhập được đúng quyền |
| T-16 | Nhập/Xuất Excel hàng hoá & khách hàng | Antigravity | DONE | Claude 07/09 | Đọc thẳng .xlsx (đọc trong trình duyệt nên không đụng gói Worker) lẫn CSV, xem trước + khoe cột nào đọc/bỏ, nhập theo lô. **Đã nhập thật 207 dòng danh mục KiotViet của spa**: 38 nhóm hàng, 95 thương hiệu, 20 đơn vị, 11 buổi trong gói, 183 định mức NVL — định mức khớp đúng giá vốn KiotViet ghi. Phần khách hàng: xem T-24 |
| T-24 | Hồ sơ khách hàng + nhập từ tệp (kéo sớm từ M4 để số buổi khách còn lại vào hệ thống trước, khỏi đối chiếu tay về sau) | Claude | DONE | Claude 07/09 | **Đã nhập thật 81 khách của spa** trên bản triển khai; đối chiếu ngược từng ô với tệp nguồn — 81/81 khách khớp cả 6 trường số/ngày lẫn 9 trường chữ. Số buổi còn lại (19 buổi, 5 khách) hiện thành cảnh báo trên danh sách |
| T-25 | Gói/liệu trình khách đang giữ: `customer_packages` + `customer_package_items` + sổ cái `package_transactions`, màn hình "Gói, thẻ đã bán", nhập từ tệp KiotViet | Claude | DONE | Claude 07/09 | `npm run db:check-packages` báo **19/19**: 13 ca dữ liệu sai bị chặn ở tầng CSDL, 6 ca dựng chuỗi giao dịch thật và trigger tính đúng số buổi lẫn trạng thái. **Đã nhập thật 19 gói của spa** trên bản triển khai; đối chiếu ngược 19 gói × 10 trường với tệp nguồn — khớp hoàn toàn. Ba đường tính độc lập đều ra 26 buổi: cache trên item, tổng sổ cái (+124 −98), và truy vấn từ phía khách hàng |

## Milestone M2 — Lịch hẹn

| ID | Việc | Agent | Status | Owner | Tiêu chí nghiệm thu |
|---|---|---|---|---|---|
| T-26 | Lược đồ lịch hẹn: `bookings`, `booking_items`, `booking_cancel_reasons`; chống trùng phòng và trùng nhân viên bằng `EXCLUDE USING gist` | Claude | DONE | Claude 12/09 | `npm run db:check-bookings` báo **21/21**: 14 ca dữ liệu sai bị chặn (có kiểm cả mã SQLSTATE để một bài kiểm sai cú pháp không "đạt" nhầm), 7 ca dựng dữ liệu đúng và phải đi lọt — quan trọng nhất là hai ca **liền kề** 9:00–10:00 và 10:00–11:00 |
| T-27 | Lưới lịch hẹn: xem theo Ngày/Tuần, tuần bắt đầu thứ Hai, đường giờ hiện tại, khối chồng giờ tự chia làn | Claude | DONE | Claude 12/09 | Kiểm chứng trên bản triển khai với 3 lịch thử (2 cái chồng giờ): chia làn đúng, màu theo trạng thái, vị trí khớp vạch giờ. Dữ liệu thử đã xoá sạch |
| T-28 | Panel đặt lịch 2 bước (chọn giờ → chi tiết) | Claude | DONE | Claude 12/09 | **Đã đặt lịch thật trên bản triển khai**: chọn giờ theo buổi, tìm khách, thêm dịch vụ, tự tính giờ kết thúc. Đặt trùng KTV hiện đúng câu *"Kỹ thuật viên này đã có lịch khác trong khung giờ vừa chọn"*. Dữ liệu thử đã xoá |
| T-29 | Kéo–thả đổi giờ, đổi trạng thái và huỷ lịch từ lưới, lịch định kỳ | Claude | TODO | | Kéo một khối sang giờ khác thì lưu ngay; huỷ lịch bắt chọn lý do |

## Backlog (mở chi tiết khi tới milestone)

- **M2 Lịch hẹn** — lưới FullCalendar, panel đặt lịch 2 bước, kéo–thả, chống trùng (`EXCLUDE gist`), buffer 5', giới hạn theo ca, lý do huỷ, lịch định kỳ
- **M3 POS** — multi-cart, picker 4 loại hàng, gán KTV/tư vấn/phòng/giờ, thanh toán (tiền mặt/CK/QR/thẻ/điểm), in hoá đơn
- **M4 Gói & thẻ** — nền móng đã xong sớm (T-24 hồ sơ khách, T-25 gói + sổ cái
  `package_transactions`). Còn lại của milestone này: **bán** gói/thẻ tại POS,
  **trừ buổi** khi làm dịch vụ (ghi `use` vào sổ cái), thẻ trả trước theo tiền
  (`kind='card'` — spa hiện chưa bán thẻ nào), hạn dùng và gia hạn
- **M5 Kho** — NCC, nhập hàng, trả hàng nhập, kiểm kho, xuất huỷ/dùng, định mức NVL, thẻ kho, giá vốn trung bình
- **M6 Nhân viên & lương** — ca, lịch làm việc, chấm công, bảng hoa hồng (2 vai trò), bảng lương
- **M7 Sổ quỹ & báo cáo** — phiếu thu/chi 3 loại quỹ, 10 báo cáo, dashboard
- **M8 CSKH** — khuyến mại, voucher, tích điểm, đánh giá QR, nhắc lịch Zalo/SMS
- **M9 Đặt lịch online** — trang public `/[tenantSlug]` + QR
- **M10 Phòng khám** — phiếu khám, thông tin y tế, album trước/sau

## Quyết định đã chốt (05/09/2026)

| # | Câu hỏi | Quyết định |
|---|---|---|
| Q1 | Phạm vi sản phẩm | **1 spa trước, chừa đường mở rộng** — DB có sẵn `tenant_id`, chưa làm UI quản lý tenant |
| Q2 | Module Phòng khám | **Cần, ưu tiên sớm** → chuyển từ M10 lên **M4** |
| Q4 | Hạ tầng | **Cloudflare Workers + Supabase Free + Google Drive + Drizzle ORM**. Bỏ Vercel (Hobby cấm dùng thương mại). Chi tiết + lý do: [`ADR-002`](./docs/decisions/ADR-002-infrastructure.md) |
| Q6 | Lưu trữ tệp | **Google Drive 2 TB của anh Khôi**, qua OAuth `drive.file` (service account không dùng được — hạn mức 0 GB), sau lớp `StorageAdapter` |
| Q7 | Mục tiêu chi phí | **0 đ** khi phát triển → **≈130.000 đ/tháng** khi vận hành thật |

## ✅ Thiết kế tổng thể — đã chốt hướng, đang thực thi

Sáu điểm chờ duyệt trước đây đã được xử lý qua vòng **phản biện chéo**
([`ADR-001`](./docs/decisions/ADR-001-design-revisions.md)) và anh Khôi đã tiếp tục cấp
thông tin hạ tầng, tức đồng ý đi tiếp:

| # | Điểm | Kết luận |
|---|---|---|
| 1 | Bản đồ 12 phân hệ | Giữ nguyên, không thêm bớt |
| 2 | Luồng E2/E3 | Giữ, sửa liên kết `booking_item ↔ invoice_item` và mốc ghi nhận |
| 3 | Hoa hồng buổi trong gói | Theo **giá trị phân bổ**, phân bổ theo tỷ trọng giá bán lẻ |
| 4 | Phân quyền | KTV không xem doanh thu toàn spa; lễ tân không xem giá vốn. Đã cài đặt trong `lib/auth/permissions.ts` |
| 5 | Lộ trình | Chèn **M3.1 / M3.2** trước M4 để gỡ phụ thuộc ngược |
| 6 | Hạ tầng | Supabase Free + Cloudflare Workers + Google Drive ([`ADR-002`](./docs/decisions/ADR-002-infrastructure.md)) |

> Anh Khôi vẫn nên đọc lại ADR-001 và ADR-002 khi có thời gian; nếu muốn đổi điều gì,
> sửa càng sớm càng rẻ.

## Câu hỏi còn để ngỏ

| # | Câu hỏi | Ảnh hưởng |
|---|---|---|
| Q3 | Có cần hoá đơn điện tử + tờ khai thuế HKD không? | Khối lượng rất lớn, đề xuất tách giai đoạn 2 |
| Q5 | Có cần POS chạy khi mất mạng không? | Ảnh hưởng kiến trúc rất lớn, đề xuất KHÔNG làm ở v1 |
