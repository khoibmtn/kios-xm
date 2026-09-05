# PROGRESS — Nhật ký tiến độ

> Mỗi agent (Claude Code / Antigravity) **thêm một dòng vào bảng Nhật ký** sau khi hoàn thành
> một task. Không xoá dòng cũ. Ghi rõ file đã đụng tới để agent kia biết mà tránh.

## Trạng thái hiện tại

| Mục | Giá trị |
|---|---|
| Milestone đang làm | **M0 — Nền móng** (chưa bắt đầu code) |
| Giai đoạn | Đã xong nghiên cứu, chờ anh Khôi chốt Q1–Q5 trong `TASKS.md` |
| Ứng dụng đã deploy | Chưa |
| Schema DB | Mới ở dạng thiết kế trong `docs/research/02-data-model.md` §B |
| Số task DONE | 0 / 16 (M0+M1) |

## Nhật ký

| Ngày | Agent | Việc đã xong | File đụng tới |
|---|---|---|---|
| 2026-09-05 | Claude Code | Khảo sát trực tiếp KiotViet Salon (tài khoản thật): bản đồ 40+ màn hình, schema API sản phẩm/khách hàng, luồng POS & lịch hẹn, toàn bộ trang Thiết lập | `docs/research/01-module-map.md`, `02-data-model.md`, `03-ux-flows.md`, `04-business-rules.md` |
| 2026-09-05 | Claude Code | Thiết lập context dùng chung cho 2 agent + kiến trúc + lộ trình M0–M10 | `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `TASKS.md`, `PROGRESS.md`, `docs/architecture/01-overview.md` |
| 2026-09-05 | Claude Code | Khảo sát sâu đợt 2: 4 form tạo hàng hoá, lương/chấm công/bảng lương, nhập hàng & kiểm kho, khuôn mẫu báo cáo, giải phẫu hoá đơn thật (HD000586) | `docs/research/05-product-forms.md`, `06-employees-inventory-reports.md`, `07-invoice-anatomy.md` |
| 2026-09-05 | Claude Code | Thiết kế tổng thể v1 để duyệt: 12 phân hệ, 4 bề mặt, 5 mẫu màn hình, 7 luồng nghiệp vụ, 12 bất biến | `docs/architecture/02-system-design.md` |
| 2026-09-05 | Claude Code | **Phản biện chéo + sửa 3 lỗi kiến trúc** (employees/users, booking↔invoice, phân bổ giá gói); chốt hạ tầng chi phí tối thiểu + Google Drive | `docs/decisions/ADR-001`, `ADR-002`, `AGENTS.md`, `02-data-model.md`, `TASKS.md` |

## Sự cố / bài học

| Ngày | Nội dung |
|---|---|
| 2026-09-05 | **Cạm bẫy khi khảo sát:** trong POS KiotViet, gán khung giờ cho một dòng dịch vụ sẽ **tạo ngay một lịch hẹn thật** (toast "Tạo lịch hẹn thành công") dù hoá đơn chưa thanh toán. Khi khảo sát đã lỡ tạo 1 lịch hẹn thử và **đã huỷ ngay** (dialog "Huỷ dịch vụ" + lý do); lịch hẹn về `Tổng số 0`. → Ghi vào `AGENTS.md` §5 làm quy tắc: chỉ đọc, không thao tác gán giờ trên dữ liệu thật. |
| 2026-09-05 | Giao diện quản trị KiotViet nằm trong **Shadow DOM** — công cụ đọc DOM thường không thấy. Muốn khảo sát tiếp phải duyệt xuyên `shadowRoot`. |
| 2026-09-05 | **Bài học thiết kế:** bản thiết kế v1 có 3 lỗi kiến trúc chỉ lộ ra khi bị phản biện chéo — (1) tự mâu thuẫn giữa phần văn xuôi và data model về `employees` vs `users`; (2) lặp 5 trường ở cả `booking_items` lẫn `invoice_items` tạo hai nguồn sự thật; (3) công thức phân bổ giá gói chỉ đúng với gói một dịch vụ. ⇒ Sau này mỗi khi viết văn xuôi khẳng định một nguyên tắc, phải **kiểm tra lại data model có tuân đúng không**. |
| 2026-09-05 | **Yêu cầu phi chức năng phải đối chiếu gói dịch vụ thật.** Tôi viết "sao lưu 30 ngày + khôi phục theo thời điểm" mà không kiểm tra: Supabase Free **không có backup**, Pro chỉ giữ 7 ngày, PITR là tính năng trả thêm tiền. |
| 2026-09-05 | **Vercel Hobby cấm dùng thương mại** — suýt chọn nhầm hạ tầng vi phạm điều khoản. **Google Drive service account có hạn mức 0 GB** từ 2023 — phải dùng OAuth tài khoản thật. Cả hai đều không tự lộ ra nếu không tra cứu. |

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
