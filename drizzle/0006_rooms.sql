-- Vị trí / phòng — nơi diễn ra một buổi dịch vụ.
--
-- Cần trước lịch hẹn (M2) chứ không phải sau: ràng buộc chống trùng phòng
-- ("hai khách không thể cùng nằm một giường") sẽ dựa vào bảng này, và ràng
-- buộc đó phải nằm ở tầng Postgres.
--
-- `rooms` gắn `branch_id` vì phòng là vật lý — giường của chi nhánh nào chỉ
-- chi nhánh đó xếp được. `room_groups` thì chỉ là nhãn gom nhóm ("Tầng 1",
-- "Khu VIP") nên để ở mức spa, dùng chung cho mọi chi nhánh.

CREATE TABLE IF NOT EXISTS room_groups (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS rooms (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id  uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  -- Xoá nhóm thì phòng vẫn còn, chỉ mất nhãn gom nhóm
  group_id   uuid REFERENCES room_groups(id) ON DELETE SET NULL,
  name       text NOT NULL,
  note       text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Trùng tên phòng trong cùng chi nhánh là lỗi nhập liệu; khác chi nhánh thì
  -- "Phòng 1" ở đâu cũng có, nên chỉ chặn trong phạm vi chi nhánh.
  UNIQUE (tenant_id, branch_id, name)
);

CREATE INDEX IF NOT EXISTS rooms_branch_active_idx ON rooms (branch_id, is_active);
