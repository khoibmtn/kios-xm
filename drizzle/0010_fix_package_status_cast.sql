-- Sửa `sync_customer_package_status()`: ép kiểu kết quả CASE về enum.
--
-- Ở `0009` hàm này viết `SET status = CASE WHEN … THEN 'used_up' ELSE 'active' END`.
-- Một literal đứng một mình gán vào cột enum thì Postgres tự ép được, nhưng khi
-- cả hai nhánh CASE đều là literal chưa định kiểu thì nó chốt kiểu kết quả
-- thành `text` rồi mới gán — và text không tự về enum.
--
-- Hậu quả không nhỏ: trigger chạy AFTER INSERT trên `customer_package_items`,
-- nên **mọi lần chèn một dòng hoàn toàn hợp lệ** cũng đổ với SQLSTATE 42804.
-- Cả tính năng gói/liệu trình không dùng được.
--
-- Đáng chú ý là 13 phép thử "dữ liệu sai phải bị chặn" đều xanh — chúng chỉ
-- chứng minh cái sai bị chặn, không chứng minh cái đúng đi lọt. Lỗi này lộ ra
-- nhờ nhóm phép thử dựng dữ liệu **hợp lệ** rồi đối chiếu con số trigger tính.

CREATE OR REPLACE FUNCTION sync_customer_package_status() RETURNS trigger AS $$
DECLARE
  -- Trên DELETE thì NEW là NULL — lấy nhầm ở đây là trigger im lặng không chạy.
  pkg uuid := COALESCE(NEW.customer_package_id, OLD.customer_package_id);
  remaining integer;
BEGIN
  SELECT COALESCE(SUM(sessions + bonus_sessions - used_sessions), 0)
  INTO remaining
  FROM customer_package_items
  WHERE customer_package_id = pkg;

  -- Huỷ và hết hạn là quyết định của con người, trigger không được lật ngược.
  UPDATE customer_packages
  SET status = (CASE WHEN remaining <= 0 THEN 'used_up' ELSE 'active' END)
                 ::"CustomerPackageStatus",
      updated_at = now()
  WHERE id = pkg AND status IN ('active', 'used_up');

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
