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

## Sự cố / bài học

| Ngày | Nội dung |
|---|---|
| 2026-09-05 | **Cạm bẫy khi khảo sát:** trong POS KiotViet, gán khung giờ cho một dòng dịch vụ sẽ **tạo ngay một lịch hẹn thật** (toast "Tạo lịch hẹn thành công") dù hoá đơn chưa thanh toán. Khi khảo sát đã lỡ tạo 1 lịch hẹn thử và **đã huỷ ngay** (dialog "Huỷ dịch vụ" + lý do); lịch hẹn về `Tổng số 0`. → Ghi vào `AGENTS.md` §5 làm quy tắc: chỉ đọc, không thao tác gán giờ trên dữ liệu thật. |
| 2026-09-05 | Giao diện quản trị KiotViet nằm trong **Shadow DOM** — công cụ đọc DOM thường không thấy. Muốn khảo sát tiếp phải duyệt xuyên `shadowRoot`. |

## Ghi chú kỹ thuật cần nhớ

- Hai bề mặt tách biệt: `(pos)` và `(admin)` — xem `docs/architecture/01-overview.md`.
- Bốn loại hàng hoá là trục thiết kế xuyên suốt: `product` · `service` · `package` · `card`.
- Mỗi dòng dịch vụ có **2 vai trò hoa hồng**: `performer` (làm) và `consultant` (tư vấn).
- Ràng buộc chống trùng lịch nên đặt ở tầng Postgres (`EXCLUDE USING gist`), không ở app.
