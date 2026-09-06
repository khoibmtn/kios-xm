-- `categories.path` đang mang hai nghĩa trái nhau.
--
-- Kịch bản seed ghi **tên nhóm** vào cột này ("Chăm sóc da"), còn mã ứng dụng
-- đọc nó như **chuỗi id tổ tiên** ("/id-cha/id-con/"). Hai cách hiểu cùng tồn
-- tại êm đẹp cho tới lúc có nhóm con thật: ô "Thuộc nhóm" liệt kê chính nhóm
-- con của nó làm nhóm cha hợp lệ, vì phép kiểm tra vòng lặp tìm `/id/` trong
-- một chuỗi vốn không chứa id nào.
--
-- Không sửa bằng cách dặn nhau "nhớ ghi path cho đúng": cột này là giá trị suy
-- ra được từ `parent_id`, nên để cơ sở dữ liệu tự tính. Sau migration này mọi
-- đường ghi — form, nhập tệp, seed, SQL gõ tay — đều không thể làm lệch nó.

-- ── 1. Tính lại toàn bộ đường dẫn từ gốc xuống ──────────────────────────
WITH RECURSIVE tree AS (
  SELECT id, '/' || id::text || '/' AS path
  FROM categories
  WHERE parent_id IS NULL

  UNION ALL

  SELECT c.id, t.path || c.id::text || '/'
  FROM categories c
  JOIN tree t ON c.parent_id = t.id
)
UPDATE categories SET path = tree.path
FROM tree
WHERE categories.id = tree.id AND categories.path IS DISTINCT FROM tree.path;

-- ── 2. Giữ đường dẫn đúng ở mọi lần ghi ─────────────────────────────────
CREATE OR REPLACE FUNCTION categories_set_path() RETURNS trigger AS $$
DECLARE
  parent_path text;
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.path := '/' || NEW.id::text || '/';
  ELSE
    SELECT path INTO parent_path FROM categories WHERE id = NEW.parent_id;

    -- Chuyển một nhóm vào chính nhánh dưới của nó sẽ cắt rời cả nhánh khỏi
    -- cây: không còn đường về gốc, nhóm biến mất khỏi mọi màn hình mà dữ liệu
    -- vẫn nằm đó. Ứng dụng đã chặn kèm câu tiếng Việt; đây là lưới cuối cùng
    -- cho những đường ghi khác.
    IF parent_path IS NULL THEN
      RAISE EXCEPTION 'Không tìm thấy nhóm cha %', NEW.parent_id;
    END IF;
    IF parent_path LIKE '%/' || NEW.id::text || '/%' THEN
      RAISE EXCEPTION 'Nhóm % không thể nằm trong chính nhánh con của nó', NEW.id;
    END IF;

    NEW.path := parent_path || NEW.id::text || '/';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS categories_path_set ON categories;
CREATE TRIGGER categories_path_set
  BEFORE INSERT OR UPDATE OF parent_id ON categories
  FOR EACH ROW EXECUTE FUNCTION categories_set_path();

-- ── 3. Đổi nhóm cha thì cả nhánh dưới phải đi theo ──────────────────────
CREATE OR REPLACE FUNCTION categories_move_subtree() RETURNS trigger AS $$
BEGIN
  IF NEW.path IS DISTINCT FROM OLD.path THEN
    UPDATE categories
       SET path = NEW.path || substring(path from length(OLD.path) + 1)
     WHERE tenant_id = NEW.tenant_id
       AND id <> NEW.id
       AND path LIKE OLD.path || '%';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS categories_path_move ON categories;
CREATE TRIGGER categories_path_move
  AFTER UPDATE OF path ON categories
  FOR EACH ROW EXECUTE FUNCTION categories_move_subtree();
