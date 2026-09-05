-- Thêm trạng thái trung gian cho hộp thư đi.
--
-- Không có nó thì lúc giành quyền xử lý phải đánh dấu ngay là "đã gửi";
-- nếu tiến trình chết giữa chừng, sự kiện mắc kẹt ở trạng thái đã gửi
-- trong khi khách chưa nhận được gì.
ALTER TYPE "OutboxStatus" ADD VALUE IF NOT EXISTS 'processing';
