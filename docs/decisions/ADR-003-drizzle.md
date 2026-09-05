# ADR-003 — Đổi ORM từ Prisma sang Drizzle

**Ngày**: 05/09/2026 · **Trạng thái**: Đã áp dụng · **Người duyệt**: anh Khôi

## Bối cảnh

`AGENTS.md` chốt Prisma, [`ADR-002`](./ADR-002-infrastructure.md) chốt Cloudflare Workers.
Hai lựa chọn này được cân nhắc **riêng lẻ** và không ai kiểm chứng chúng có chạy cùng nhau
được không. Khi triển khai thật thì lộ ra là không.

## Vấn đề

Mọi truy vấn cơ sở dữ liệu trên production đều hỏng:

```
WebAssembly.Module(): Wasm code generation disallowed by embedder
```

Prisma 7 biên dịch query compiler dạng WASM **lúc chạy**. Cloudflare `workerd` chỉ chấp
nhận WASM được **import tĩnh** ở thời điểm đóng gói, và từ chối mọi lời gọi
`new WebAssembly.Module(bytes)`.

Đã thử cách Prisma khuyến nghị: generator `prisma-client` với `runtime = "workerd"` và
`moduleFormat = "esm"`, vốn để chọn loader dùng import tĩnh. **Vẫn hỏng**, vì OpenNext
nhúng tệp WASM thành chuỗi base64 khi đóng gói — nên nó không còn là import tĩnh nữa.

Đây là lỗi đã biết của Prisma: [prisma/prisma#28657](https://github.com/prisma/prisma/issues/28657),
mở từ 22/11/2025, đến nay chưa có bản vá.

## Các phương án đã cân nhắc

| Phương án | Vì sao không chọn |
|---|---|
| Hạ Prisma về 6.x | Cũng dùng WASM cho môi trường edge; nhiều khả năng gặp lại đúng vấn đề, mà lại lùi một phiên bản lớn |
| Đổi nơi triển khai sang nền tảng Node | Mất lợi thế Cloudflare vừa dựng xong, và phát sinh chi phí — trái yêu cầu chi phí tối thiểu |
| Prisma Accelerate (truy vấn qua HTTP) | Trả phí, trái yêu cầu chi phí tối thiểu |
| Chờ Prisma vá | Không biết bao giờ; càng để lâu, đổi ORM càng đắt |

## Quyết định

**Chuyển sang Drizzle ORM.**

Drizzle sinh SQL thuần, không dùng WASM, chạy được cả trên Node lẫn Workers.

Ba lý do khiến đây không chỉ là giải pháp chữa cháy:

1. **Thời điểm rẻ nhất.** Mới có 13 bảng và 4 tệp chạm tới tầng dữ liệu. Đến M3 với hơn
   40 bảng thì chi phí đổi sẽ lớn gấp bội.
2. **Hợp với thiết kế sẵn có.** Những ràng buộc quan trọng nhất của hệ thống đều là SQL
   cấp cơ sở dữ liệu mà Prisma không mô hình hoá được: chống trùng lịch bằng
   `EXCLUDE USING gist`, trigger cưỡng chế ledger cho gói dịch vụ, khoá sổ theo ngày.
   Ngay từ migration đầu tiên đã phải viết SQL tay rồi.
3. **Không mất gì đã làm.** Lược đồ được sinh bằng `drizzle-kit pull` đọc ngược từ chính
   cơ sở dữ liệu đang chạy — 14 bảng, 121 cột, 20 khoá ngoại, khớp tuyệt đối. Không bảng
   nào phải tạo lại, không dữ liệu nào phải chuyển.

## Ba điểm introspect không suy ra được, đã chỉnh tay

| Điểm | Xử lý |
|---|---|
| `id` không có `DEFAULT` trong cơ sở dữ liệu (Prisma sinh UUID ở tầng ứng dụng) | `uuid().primaryKey().defaultRandom()` — để Postgres tự sinh |
| `@updatedAt` là hành vi tầng ứng dụng của Prisma | `.defaultNow().$onUpdate(() => new Date())` |
| Cột thời gian trả về chuỗi | Đổi sang `mode: 'date'` — cần cho tính khung giờ lịch hẹn |

## Hệ quả

- `AGENTS.md` §2 đã cập nhật: Drizzle thay Prisma.
- Lệnh đổi: `prisma migrate` → `drizzle-kit push` / `pull`, `prisma studio` → `drizzle-kit studio`.
- Thư mục `prisma/` đã gỡ; lược đồ nằm ở `lib/schema/`.
- Ràng buộc SQL cấp cơ sở dữ liệu từ nay viết thẳng trong tệp migration của `drizzle/`,
  không phải lách qua ORM.

## Kiểm chứng

Sau khi chuyển, production tại `https://kios-xm.spa-xumay.workers.dev`:

- `/api/health` báo cơ sở dữ liệu **đã kết nối**, độ trễ ~800 ms, đọc đúng số bản ghi
- Đăng nhập bằng tài khoản lễ tân chạy đúng: phiên mang đủ spa/chi nhánh/vai trò,
  và chỉ được cấp **14/43 quyền** — không thấy giá vốn, lợi nhuận, chẩn đoán y tế

## Bài học

Khi chốt hai thành phần nền tảng ở hai thời điểm khác nhau, phải kiểm chứng chúng **chạy
cùng nhau** trước khi xây tiếp lên trên. Ở đây tôi chốt Prisma trong `AGENTS.md` rồi mới
chốt Cloudflare trong ADR-002, và chỉ phát hiện xung đột khi đã viết xong tầng xác thực,
phân quyền và lưu trữ. Một lần deploy thử ngay sau M0 đã tiết kiệm được nửa ngày.
