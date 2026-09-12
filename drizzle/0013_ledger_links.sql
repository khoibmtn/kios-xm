-- Gắn khoá ngoại cho hai cột đã "chờ sẵn" từ migration 0009.
--
-- `package_transactions.invoice_item_id` và `booking_item_id` được thêm lúc hai
-- bảng kia chưa tồn tại, nên chúng chỉ là `uuid` trần. Hậu quả lộ ra ngay lần
-- dọn dữ liệu thử đầu tiên: xoá hoá đơn **không hoàn buổi lại cho khách** —
-- tổng buổi đứng ở 25 thay vì về 26, và không có lỗi nào báo.
--
-- ⇒ Một cột dự phòng cho bảng chưa tồn tại không phải là một liên kết. Khi
-- bảng ấy ra đời thì phải quay lại gắn khoá ngoại và **quyết định hành vi khi
-- xoá**, nếu không nó chỉ là liên kết trong đầu người viết.
--
-- `RESTRICT` chứ không `CASCADE`: xoá một hoá đơn đã trừ buổi của khách phải bị
-- từ chối thẳng. Đường đúng là **huỷ** hoá đơn — ghi bút toán ngược hoàn buổi
-- và đảo phiếu thu — chứ không xoá lịch sử.

ALTER TABLE package_transactions
  ADD CONSTRAINT package_transactions_invoice_item_fkey
  FOREIGN KEY (invoice_item_id) REFERENCES invoice_items(id) ON DELETE RESTRICT;

ALTER TABLE package_transactions
  ADD CONSTRAINT package_transactions_booking_item_fkey
  FOREIGN KEY (booking_item_id) REFERENCES booking_items(id) ON DELETE SET NULL;

-- Tương tự cho hoá đơn: dòng hoá đơn trỏ tới buổi trong gói thì không được để
-- gói bị xoá mất trong khi hoá đơn vẫn còn nhắc tới nó.
ALTER TABLE invoice_items
  DROP CONSTRAINT IF EXISTS invoice_items_customer_package_item_id_fkey;
ALTER TABLE invoice_items
  ADD CONSTRAINT invoice_items_customer_package_item_id_fkey
  FOREIGN KEY (customer_package_item_id) REFERENCES customer_package_items(id) ON DELETE RESTRICT;
