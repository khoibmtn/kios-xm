-- Khách hàng — bảng mà lịch hẹn (M2) và thu ngân (M3) đều cần trước khi dùng
-- được, nên kéo lên sớm hơn vị trí M4 trong lộ trình.
--
-- Hai nhóm cột cần phân biệt rõ, vì rất dễ nhầm nhau về sau:
--
--  * Cột hồ sơ (tên, số điện thoại, địa chỉ…) là dữ liệu sống, phần mềm này
--    sở hữu và sửa.
--  * Cột `migrated_*` là **ảnh chụp từ phần mềm cũ tại thời điểm chuyển sang**,
--    không phải số dư sống. Sau khi spa bán hàng trong hệ mới, chúng đứng im
--    và sẽ sai nếu ai đó đọc như số hiện tại. Giữ lại vì nếu spa ngừng trả
--    tiền KiotViet thì không còn cách nào lấy lại, và vì cần đối chiếu trong
--    giai đoạn chạy song song.

CREATE TABLE IF NOT EXISTS customer_groups (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS customers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- Chi nhánh tạo hồ sơ, không phải chi nhánh sở hữu: khách đến chi nhánh nào
  -- cũng phải tra ra được, nên mọi truy vấn lọc theo tenant chứ không theo đây.
  branch_id  uuid REFERENCES branches(id) ON DELETE SET NULL,
  group_id   uuid REFERENCES customer_groups(id) ON DELETE SET NULL,

  code       text NOT NULL,
  name       text NOT NULL,
  phone      text,
  email      text,
  gender     "Gender",
  birthday   date,

  -- Đơn vị hành chính sau sáp nhập 2025
  province   text,
  ward       text,
  address    text,
  -- Tên trước sáp nhập. Dữ liệu cũ của spa hầu hết chỉ có ở đây (66/81 khách),
  -- nên bỏ đi là mất phần lớn thông tin địa lý.
  former_area text,
  former_ward text,

  company    text,
  tax_code   text,
  facebook   text,
  source     text,
  note       text,
  is_active  boolean NOT NULL DEFAULT true,

  -- ── Ảnh chụp từ phần mềm cũ, xem chú thích đầu tệp ──
  migrated_at                 timestamptz,
  migrated_visits             integer,
  migrated_total_spent        numeric(14,2),
  migrated_debt               numeric(14,2),
  migrated_card_balance       numeric(14,2),
  migrated_remaining_sessions integer,
  first_visit_at              date,
  last_visit_at               date,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

-- Lễ tân tra khách bằng số điện thoại là thao tác nhiều nhất trong ngày.
-- Không đặt UNIQUE: cả nhà dùng chung một số là chuyện bình thường ở spa.
CREATE INDEX IF NOT EXISTS customers_tenant_phone_idx ON customers (tenant_id, phone);
CREATE INDEX IF NOT EXISTS customers_tenant_name_idx ON customers (tenant_id, name);
