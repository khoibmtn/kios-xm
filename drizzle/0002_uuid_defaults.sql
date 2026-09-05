-- Prisma sinh UUID ở tầng ứng dụng nên các cột id không có DEFAULT trong CSDL.
-- Drizzle chạy phía máy chủ và gửi từ khoá DEFAULT khi chèn, nên cột buộc phải
-- có DEFAULT thật, nếu không sẽ vi phạm ràng buộc NOT NULL.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'id'
      AND c.data_type = 'uuid'
      AND c.column_default IS NULL
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN id SET DEFAULT gen_random_uuid()', t);
    RAISE NOTICE 'đã đặt default cho %', t;
  END LOOP;
END $$;
