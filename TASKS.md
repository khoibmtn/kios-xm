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
| T-01 | Khởi tạo Next.js 15 + TypeScript + Tailwind + ESLint/Prettier | Claude | TODO | | `pnpm dev` chạy; Tailwind áp dụng được; `pnpm build` sạch |
| T-02 | Cài shadcn/ui, thiết lập design token (màu, spacing, font Inter/Be Vietnam Pro) | Antigravity | TODO | | Có `Button`, `Input`, `Dialog`, `Sheet`, `Table`, `Badge`; hiển thị đúng tiếng Việt có dấu |
| T-03 | Prisma + Postgres (Neon), schema M0: tenants, branches, users, roles, user_branch_roles, tenant_features | Claude | TODO | | `prisma migrate dev` chạy; seed 1 tenant + 1 chi nhánh + 1 owner |
| T-04 | Auth.js: đăng nhập email/mật khẩu, session mang `tenantId` + `branchId` | Claude | TODO | | Đăng nhập/đăng xuất; route `(admin)` chặn khi chưa đăng nhập |
| T-05 | Layout Quản trị: topbar + sidebar theo cây menu trong `docs/research/01-module-map.md` | Antigravity | TODO | | Đủ nhóm menu; thu gọn được; mobile có drawer; active state đúng |
| T-06 | Layout POS: header 2 tab (Lịch hẹn / Bán hàng), không sidebar | Antigravity | TODO | | Chạy tốt ở 1024×768 ngang và 375px |
| T-07 | Component `DataTable` dùng chung (TanStack Table): sidebar lọc + bảng + dòng tổng + phân trang + tuỳ chỉnh cột + xuất file | Claude | TODO | | Dùng lại được cho ≥2 module; mobile tự chuyển sang dạng thẻ |
| T-08 | Chuẩn hoá tiền tệ/ngày giờ: `lib/format.ts` (VND, `vi-VN`, `Asia/Ho_Chi_Minh`) | Antigravity | TODO | | `formatMoney(1500000)` → `1.500.000`; test đơn vị |
| T-09 | Deploy Vercel + Neon, biến môi trường, `.env.example` | Claude | TODO | | URL production mở được trang đăng nhập |

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

## Câu hỏi đang chờ anh Khôi quyết

| # | Câu hỏi | Ảnh hưởng |
|---|---|---|
| Q1 | Chỉ dùng cho 1 spa của anh, hay bán cho nhiều spa (SaaS)? | Quyết định độ sâu multi-tenant |
| Q2 | Có cần module **Phòng khám** (phiếu khám, tiền sử, dị ứng) ngay từ đầu không? | Đưa M10 lên sớm hay để cuối |
| Q3 | Có cần hoá đơn điện tử + tờ khai thuế HKD không? | Khối lượng rất lớn, nên tách giai đoạn 2 |
| Q4 | Nhà cung cấp DB: Neon hay Supabase? | Supabase có sẵn auth + storage + realtime |
| Q5 | Có cần chạy được khi mất mạng (offline POS) không? | Ảnh hưởng kiến trúc rất lớn |
