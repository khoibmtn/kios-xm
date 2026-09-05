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
| T-02 | Cài shadcn/ui, thiết lập design token (màu, spacing, font Inter/Be Vietnam Pro) | Antigravity | TODO | | Có `Button`, `Input`, `Dialog`, `Sheet`, `Table`, `Badge`; hiển thị đúng tiếng Việt có dấu |
| T-03 | Prisma + Supabase Postgres, schema M0: tenants, branches, users, roles, user_branch_roles, tenant_features, tenant_settings, files, outbox_events, audit_log | Claude | DONE | Claude 05/09 | `prisma migrate dev` chạy; seed 1 tenant + 1 chi nhánh + 1 owner |
| T-04 | Auth.js: đăng nhập email/mật khẩu, session mang `tenantId` + `branchId` | Claude | TODO | | Đăng nhập/đăng xuất; route `(admin)` chặn khi chưa đăng nhập |
| T-05 | Layout Quản trị: topbar + sidebar theo cây menu trong `docs/research/01-module-map.md` | Antigravity | TODO | | Đủ nhóm menu; thu gọn được; mobile có drawer; active state đúng |
| T-06 | Layout POS: header 2 tab (Lịch hẹn / Bán hàng), không sidebar | Antigravity | TODO | | Chạy tốt ở 1024×768 ngang và 375px |
| T-07 | Component `DataTable` dùng chung (TanStack Table): sidebar lọc + bảng + dòng tổng + phân trang + tuỳ chỉnh cột + xuất file | Claude | TODO | | Dùng lại được cho ≥2 module; mobile tự chuyển sang dạng thẻ |
| T-08 | Chuẩn hoá tiền tệ/ngày giờ: `lib/format.ts` (VND, `vi-VN`, `Asia/Ho_Chi_Minh`) | Antigravity | TODO | | `formatMoney(1500000)` → `1.500.000`; test đơn vị |
| T-09 | Deploy Cloudflare Workers + Supabase Free, biến môi trường, `.env.example` | Claude | TODO | | URL production mở được trang đăng nhập |
| T-17 | `StorageAdapter` + `GoogleDriveAdapter` (OAuth `drive.file`, refresh token mã hoá) + bảng `files` | Claude | TODO | | Upload 1 ảnh lên Drive của anh Khôi, đọc lại qua endpoint có kiểm tra quyền |
| T-18 | RBAC chi tiết: quyền theo module × hành động + 4 quyền y tế theo tầng + `audit_log` | Claude | TODO | | Lễ tân thấy ⚠ cảnh báo y tế nhưng không mở được chẩn đoán; mọi lần xem hồ sơ y tế đều có log |
| T-19 | `outbox_events` + worker gửi (Cron Trigger) | Claude | TODO | | Ghi sự kiện trong transaction, worker gửi sau commit, có retry, không gửi trùng |
| T-20 | Cron sao lưu: `pg_dump` → nén → Google Drive `/backups`, giữ 30 bản + ping chống pause | Claude | TODO | | Chạy 3 ngày liên tiếp có 3 file; khôi phục thử thành công |
| T-21 | `tenant_settings` + `tenant_features` (slot 15/30/60, buffer, chế độ phân bổ gói, khoá sổ) | Antigravity | TODO | | Đổi slot sang 15 phút thì lịch hẹn hiển thị đúng |

## Milestone M1 — Danh mục

| ID | Việc | Agent | Status | Owner | Tiêu chí nghiệm thu |
|---|---|---|---|---|---|
| T-10 | Schema danh mục: categories, brands, products (4 `kind`), variants, package_items, service_materials | Claude | TODO | | Migrate sạch; ràng buộc `kind` đúng; seed dữ liệu mẫu |
| T-11 | Trang Danh sách hàng hoá: bảng + sidebar lọc (loại, nhóm, thương hiệu, tồn kho, trạng thái) | Any | TODO | | Lọc hoạt động; badge màu theo `kind`; phân trang |
| T-12 | Form thêm/sửa hàng hoá — tab theo `kind` (Sản phẩm / Dịch vụ / Gói / Thẻ) | Claude | TODO | | Dịch vụ có `duration`; Gói có danh sách buổi; Thẻ có mệnh giá + tặng |
| T-13 | Quản lý nhóm hàng (cây) + thương hiệu + đơn vị tính | Antigravity | TODO | | CRUD đủ; nhóm hàng nhiều cấp |
| T-14 | Vị trí/phòng + nhóm vị trí | Antigravity | TODO | | CRUD; trường: tên, ghi chú, nhóm, trạng thái, số thứ tự |
| T-15 | Nhân viên: CRUD + phòng ban + chức danh | Any | TODO | | Đủ trường trong `docs/research/03-ux-flows.md` §5 |
| T-16 | Nhập/Xuất Excel hàng hoá & khách hàng | Antigravity | TODO | | Nhập 196 dòng mẫu không lỗi; xuất đúng cột |

## Backlog (mở chi tiết khi tới milestone)

- **M2 Lịch hẹn** — lưới FullCalendar, panel đặt lịch 2 bước, kéo–thả, chống trùng (`EXCLUDE gist`), buffer 5', giới hạn theo ca, lý do huỷ, lịch định kỳ
- **M3 POS** — multi-cart, picker 4 loại hàng, gán KTV/tư vấn/phòng/giờ, thanh toán (tiền mặt/CK/QR/thẻ/điểm), in hoá đơn
- **M4 Gói & thẻ** — bán, trừ buổi, trừ tiền, hạn dùng, màn hình "Thẻ & gói đã bán"
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
| Q4 | Hạ tầng | **Cloudflare Workers + Supabase Free + Google Drive**. Bỏ Vercel (Hobby cấm dùng thương mại). Chi tiết + lý do: [`ADR-002`](./docs/decisions/ADR-002-infrastructure.md) |
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
