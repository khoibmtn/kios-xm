-- Lịch hẹn: phiếu hẹn và từng dòng dịch vụ trong đó.
--
-- Thiết kế bám hai thứ: cách KiotViet thật sự hành xử (quan sát trực tiếp, ghi
-- ở `docs/research/03-ux-flows.md` §1) và `AGENTS.md` §3b.
--
--   §3b.2  **Mỗi dịch vụ luôn sinh một `booking_item`**, kể cả khách vãng lai
--          làm ngay tại quầy. Thời gian và phòng có nguồn sự thật ở đây; giá và
--          giảm giá thì ở `invoice_items`. Không có chuyện một dịch vụ nằm trên
--          hoá đơn mà không có dòng lịch — KiotViet cũng vậy: gán khung giờ cho
--          một dòng dịch vụ trong POS là **tạo ngay một lịch hẹn thật**.
--   §3b.1  Người *làm* dịch vụ trỏ `employees`; người *bấm nút* trỏ `users`.
--
-- Chống trùng lịch đặt ở tầng cơ sở dữ liệu, không ở mã ứng dụng. Hai lễ tân
-- cùng đặt một phòng vào một khung giờ trong cùng một giây là chuyện bình
-- thường ở quầy; mọi cách kiểm tra bằng "SELECT rồi INSERT" đều có khe hở giữa
-- hai câu lệnh. `EXCLUDE USING gist` thì không.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE "BookingStatus" AS ENUM (
  'scheduled',   -- Chưa tới
  'confirmed',   -- Đã xác nhận
  'arrived',     -- Khách đã tới
  'in_progress', -- Đang làm
  'done',        -- Hoàn thành
  'cancelled',   -- Đã huỷ
  'no_show'      -- Khách không tới
);

-- ─────────────────────── Lý do huỷ (thiết lập được) ───────────────────────
-- KiotViet bắt chọn lý do khi huỷ và cho phép tự khai danh mục lý do
-- (`docs/research/04-business-rules.md` §5). Chỗ này để chủ spa sửa được.

CREATE TABLE booking_cancel_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX booking_cancel_reasons_tenant_name_key
  ON booking_cancel_reasons (tenant_id, name);

-- ───────────────────────────── Phiếu hẹn ─────────────────────────────

CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,

  /*
   * Khách có hồ sơ thì trỏ `customer_id`; khách vãng lai chưa kịp lập hồ sơ thì
   * ghi tạm tên và số điện thoại. Bắt buộc phải có một trong hai — lịch hẹn
   * không biết của ai thì lễ tân không gọi được cho khách khi cần đổi giờ.
   */
  customer_id uuid REFERENCES customers(id) ON DELETE RESTRICT,
  guest_name text,
  guest_phone text,

  code text NOT NULL,
  status "BookingStatus" NOT NULL DEFAULT 'scheduled',
  note text,

  /** Đặt ở quầy hay khách tự đặt online (M9). */
  source text NOT NULL DEFAULT 'staff',

  cancelled_at timestamptz,
  cancel_reason_id uuid REFERENCES booking_cancel_reasons(id) ON DELETE SET NULL,
  cancel_note text,

  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bookings_has_someone CHECK (
    customer_id IS NOT NULL OR (guest_name IS NOT NULL AND btrim(guest_name) <> '')
  ),
  -- Huỷ mà không nói lý do thì tháng sau không ai biết vì sao mất khách.
  CONSTRAINT bookings_cancel_needs_reason CHECK (
    status <> 'cancelled'
    OR (cancelled_at IS NOT NULL
        AND (cancel_reason_id IS NOT NULL OR (cancel_note IS NOT NULL AND btrim(cancel_note) <> '')))
  )
);

CREATE UNIQUE INDEX bookings_tenant_code_key ON bookings (tenant_id, code);
CREATE INDEX bookings_customer_idx ON bookings (customer_id);
CREATE INDEX bookings_branch_status_idx ON bookings (branch_id, status);

-- ──────────────────── Từng dòng dịch vụ trong phiếu hẹn ────────────────────

CREATE TABLE booking_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  service_id uuid REFERENCES products(id) ON DELETE RESTRICT,
  /** Ảnh chụp tên lúc đặt — đổi tên dịch vụ không sửa lại lịch sử. */
  service_name text NOT NULL,

  room_id uuid REFERENCES rooms(id) ON DELETE SET NULL,
  performer_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,

  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,

  /*
   * Buổi này trừ từ gói khách đang giữ, nếu có. Khi dịch vụ làm xong thì ghi
   * một giao dịch `use` vào `package_transactions` — bảng đó đã có sẵn cột
   * `booking_item_id` chờ từ migration 0009.
   */
  customer_package_item_id uuid REFERENCES customer_package_items(id) ON DELETE SET NULL,

  /*
   * Huỷ từng dòng chứ không chỉ huỷ cả phiếu: KiotViet cho xoá một dịch vụ ra
   * khỏi hoá đơn và hỏi lý do riêng cho dòng đó. Dòng đã huỷ không còn giữ chỗ
   * — xem điều kiện của hai ràng buộc EXCLUDE bên dưới.
   */
  cancelled_at timestamptz,
  cancel_reason_id uuid REFERENCES booking_cancel_reasons(id) ON DELETE SET NULL,
  cancel_note text,

  note text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT booking_items_time_forward CHECK (ends_at > starts_at),
  -- Một buổi dài quá 12 tiếng gần như chắc chắn là gõ nhầm ngày.
  CONSTRAINT booking_items_time_sane CHECK (ends_at - starts_at <= interval '12 hours')
);

CREATE INDEX booking_items_booking_idx ON booking_items (booking_id);
CREATE INDEX booking_items_time_idx ON booking_items (tenant_id, starts_at);
CREATE INDEX booking_items_room_idx ON booking_items (room_id, starts_at);
CREATE INDEX booking_items_performer_idx ON booking_items (performer_employee_id, starts_at);

/*
 * Hai ràng buộc chống trùng.
 *
 * `tstzrange(starts_at, ends_at, '[)')` — nửa mở ở cuối, nên 9:00–10:00 và
 * 10:00–11:00 **không** coi là chồng nhau. Đóng cả hai đầu thì hai ca liền kề
 * sẽ bị từ chối, và lễ tân sẽ phải lùi một phút cho vừa lòng máy.
 *
 * Điều kiện `WHERE cancelled_at IS NULL`: dòng đã huỷ nhả chỗ ra ngay.
 *
 * Buffer 5 phút giữa hai dịch vụ (`tenant_settings.booking_buffer_minutes`)
 * **không** nằm trong ràng buộc này. Nó là quy tắc gợi ý giờ cho dịch vụ kế
 * tiếp *trong cùng một phiếu hẹn* (`docs/research/04-business-rules.md` §5),
 * không phải luật cấm hai khách khác nhau dùng phòng liền nhau. Nhét buffer
 * vào đây là biến một tuỳ chọn mềm thành lời từ chối cứng mà người dùng không
 * hiểu vì sao.
 */
ALTER TABLE booking_items ADD CONSTRAINT booking_items_no_room_overlap
  EXCLUDE USING gist (
    room_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (room_id IS NOT NULL AND cancelled_at IS NULL);

ALTER TABLE booking_items ADD CONSTRAINT booking_items_no_performer_overlap
  EXCLUDE USING gist (
    performer_employee_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (performer_employee_id IS NOT NULL AND cancelled_at IS NULL);

-- ──────────────── Huỷ phiếu thì huỷ luôn các dòng của nó ────────────────
--
-- Không để mã ứng dụng nhớ việc này: quên một lần là một phòng bị giữ chỗ bởi
-- một lịch hẹn đã huỷ, và không ai hiểu vì sao đặt không được.

CREATE OR REPLACE FUNCTION cascade_booking_cancellation() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'cancelled' AND (OLD.status IS DISTINCT FROM 'cancelled') THEN
    UPDATE booking_items
    SET cancelled_at = COALESCE(NEW.cancelled_at, now()),
        cancel_reason_id = COALESCE(cancel_reason_id, NEW.cancel_reason_id),
        cancel_note = COALESCE(cancel_note, NEW.cancel_note)
    WHERE booking_id = NEW.id AND cancelled_at IS NULL;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bookings_cascade_cancel
AFTER UPDATE OF status ON bookings
FOR EACH ROW EXECUTE FUNCTION cascade_booking_cancellation();

-- ───────────────────────── Lý do huỷ mặc định ─────────────────────────
-- Năm lý do quan sát được trong KiotViet của spa. Chủ spa sửa được sau.

INSERT INTO booking_cancel_reasons (tenant_id, name, sort_order)
SELECT t.id, r.name, r.sort_order
FROM tenants t
CROSS JOIN (VALUES
  ('Khách bận đột xuất', 1),
  ('Khách đổi lịch', 2),
  ('Khách không tới', 3),
  ('Spa không sắp xếp được nhân viên', 4),
  ('Lý do khác', 5)
) AS r(name, sort_order)
ON CONFLICT DO NOTHING;
