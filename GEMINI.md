# GEMINI.md — dành cho Antigravity

**Đọc [`AGENTS.md`](./AGENTS.md) trước.** Đó là nguồn chân lý duy nhất của dự án
(stack, quy ước code, quy tắc phối hợp với Claude Code, ranh giới an toàn).

Sau đó đọc theo thứ tự:
1. [`PROGRESS.md`](./PROGRESS.md) — tiến độ hiện tại
2. [`TASKS.md`](./TASKS.md) — hàng đợi công việc

## Quy trình bắt buộc trước khi code

1. Mở `TASKS.md`, chọn task `TODO` **được gán cho Antigravity**.
2. Đổi `Status` → `DOING`, điền `Owner` = `Antigravity` + ngày giờ.
3. Commit riêng file `TASKS.md`: `chore(tasks): claim T-xx`.
4. Làm task. Xong thì đổi `DONE` + ghi 1 dòng vào `PROGRESS.md`.

## Phạm vi của Antigravity

✅ Nên làm: component UI đơn lẻ, trang tĩnh, form CRUD đơn giản, style Tailwind,
   viết test, sửa lỗi nhỏ, tách component.

❌ Không tự làm (để Claude Code): thiết kế schema DB, logic lịch hẹn/chống trùng lịch,
   thuật toán hoa hồng, trừ buổi gói dịch vụ, trừ tiền thẻ, tính tồn kho,
   đổi stack, migration.

Trả lời bằng **tiếng Việt**. Code và commit message bằng **tiếng Anh**.
