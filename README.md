# kios-xm

Phần mềm quản lý **spa / thẩm mỹ viện** — thay thế KiotViet Salon.
Next.js + Tailwind CSS + PostgreSQL, triển khai trên Vercel, tối ưu cho cả desktop và điện thoại.

## Bắt đầu từ đâu

| Bạn là | Đọc file |
|---|---|
| **AI agent** (Claude Code / Antigravity) | [`AGENTS.md`](./AGENTS.md) → [`PROGRESS.md`](./PROGRESS.md) → [`TASKS.md`](./TASKS.md) |
| Người mới vào dự án | [`docs/architecture/01-overview.md`](./docs/architecture/01-overview.md) |
| Muốn hiểu nghiệp vụ spa | [`docs/research/`](./docs/research/) |

## Tài liệu

```
AGENTS.md      Nguồn chân lý: stack, quy ước, quy tắc phối hợp 2 agent
PROGRESS.md    Nhật ký tiến độ (cả 2 agent cùng ghi)
TASKS.md       Hàng đợi công việc + phân công + câu hỏi chờ quyết
docs/
├─ research/       Khảo sát KiotViet Salon (chỉ đọc)
│  ├─ 01-module-map.md      Bản đồ 40+ màn hình, kiến trúc hệ thống gốc
│  ├─ 02-data-model.md      Schema API thật + mô hình DB đề xuất
│  ├─ 03-ux-flows.md        Luồng POS, lịch hẹn, các mẫu UI
│  └─ 04-business-rules.md  Toàn bộ tuỳ chọn cấu hình & quy tắc nghiệp vụ
├─ architecture/   Kiến trúc, ranh giới service, lộ trình M0–M10
└─ decisions/      ADR — các quyết định kiến trúc đã chốt
```

## Phạm vi sản phẩm

11 nhóm chức năng: Lịch hẹn · POS bán hàng · Hàng hoá (4 loại: sản phẩm/dịch vụ/gói
liệu trình/thẻ trả trước) · Khách hàng & hồ sơ · Gói & thẻ trả trước · Kho & nhà cung cấp ·
Nhân viên (ca, chấm công, hoa hồng 2 vai trò, lương) · Sổ quỹ · Báo cáo · CSKH
(khuyến mại, voucher, tích điểm, đánh giá) · Đặt lịch online.
Tuỳ chọn: module **Phòng khám** (phiếu khám, thông tin y tế).

## Trạng thái

🟡 **M0 — Nền móng**, chưa bắt đầu code. Đang chờ chốt Q1–Q5 trong [`TASKS.md`](./TASKS.md).
