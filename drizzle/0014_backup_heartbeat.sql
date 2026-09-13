-- Ghi lại lần sao lưu thành công gần nhất, để màn hình Tổng quan đọc được mà
-- không phải gọi sang Google Drive.
--
-- Vì sao cần. Đêm 12→13/09 job sao lưu hỏng và **không ai biết** cho tới khi
-- GitHub gửi email. Ứng dụng hoàn toàn không có khái niệm "lần cuối sao lưu
-- được là bao giờ" — nó chỉ đẩy tệp lên Drive rồi quên. Một bản sao lưu mà
-- người dùng không nhìn thấy trạng thái thì chẳng khác gì không có: hỏng lúc
-- nào cũng được, miễn là đừng ai kiểm tra.
--
-- Cố ý để ở `tenant_settings` chứ không dựng bảng lịch sử riêng: thứ cần trả
-- lời là một câu hỏi duy nhất — "lần cuối là bao giờ" — và lịch sử đầy đủ đã
-- nằm sẵn trong chính thư mục backups trên Drive.

ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS drive_last_backup_at timestamptz(6),
  ADD COLUMN IF NOT EXISTS drive_last_backup_name text;

COMMENT ON COLUMN tenant_settings.drive_last_backup_at IS
  'Mốc tải lên thành công gần nhất của scripts/backup.ts. Màn hình Tổng quan cảnh báo khi mốc này quá cũ.';
