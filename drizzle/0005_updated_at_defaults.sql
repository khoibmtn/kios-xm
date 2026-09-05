-- Cùng gốc rễ với 0002, mà 0002 chỉ chữa được một nửa.
--
-- Prisma xử lý `@updatedAt` ở tầng ứng dụng, nên các cột `updated_at` sinh ra
-- từ thời Prisma là NOT NULL mà **không có DEFAULT**. Drizzle thì gửi từ khoá
-- `DEFAULT` cho mọi cột không được truyền giá trị — với cột không có default
-- thật, `DEFAULT` nghĩa là NULL, và câu chèn vi phạm NOT NULL.
--
-- `.defaultNow()` trong lược đồ Drizzle không cứu được: nó chỉ dùng khi sinh
-- DDL, không chèn giá trị lúc chạy. `$onUpdate` cũng chỉ lo lệnh UPDATE.
--
-- 0002 đã gặp đúng chuyện này với cột `id` và chỉ đặt default cho `id`. Bảng
-- danh mục thoát nạn vì do chính tôi tạo bằng `0003_catalog.sql`, có ghi
-- `DEFAULT now()`. Năm bảng còn lại từ thời Prisma thì không, nên mọi lần chèn
-- nhân viên, người dùng, chi nhánh hay spa mới đều hỏng — chưa ai chèn nên
-- chưa ai biết.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'updated_at'
      AND c.is_nullable = 'NO'
      AND c.column_default IS NULL
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT now()', r.table_name, r.column_name);
    RAISE NOTICE 'đã đặt default cho %.%', r.table_name, r.column_name;
  END LOOP;
END $$;
