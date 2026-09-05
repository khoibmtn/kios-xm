-- `employees.bankName` là cột duy nhất trong cả cơ sở dữ liệu không theo
-- snake_case: lược đồ Prisma ban đầu thiếu đúng một `@map("bank_name")`.
--
-- Nó im lặng cho tới khi form nhân viên chạy thật, vì `drizzle-kit pull` sinh
-- ra `bankName: text()` không kèm tên cột, còn `casing: 'snake_case'` trong
-- `lib/db.ts` lại dịch khoá JS đó thành `bank_name`. Lược đồ và cơ sở dữ liệu
-- nói hai thứ tiếng khác nhau ở đúng một chỗ, và chỗ đó không có kiểm thử nào
-- đi qua.
--
-- Đổi tên cột thay vì gắn tên cứng vào lược đồ: một cột lạc quy ước trong CSDL
-- toàn snake_case sẽ còn bẫy tiếp bất cứ ai viết SQL tay. RENAME giữ nguyên dữ
-- liệu, và điều kiện dưới đây khiến chạy lại nhiều lần vẫn an toàn.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'bankName'
  ) THEN
    ALTER TABLE employees RENAME COLUMN "bankName" TO bank_name;
  END IF;
END $$;
