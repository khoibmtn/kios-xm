-- Gói/liệu trình khách đang giữ, và sổ cái trừ buổi.
--
-- Tới đây `customers.migrated_remaining_sessions` mới hết là con số chết. Nó là
-- ảnh chụp lúc chuyển từ KiotViet: đúng vào ngày nhập rồi đứng im mãi. Ba bảng
-- dưới đây biến nó thành số dư sống — biết khách mua gói nào, còn mấy buổi của
-- dịch vụ nào, và mỗi buổi đã trừ lúc nào, ai làm.
--
-- Ba quy tắc của `AGENTS.md` §3b chi phối thiết kế này:
--
--   §3b.4  Giá trị buổi phân bổ theo tỷ trọng giá lẻ và **chốt lúc bán**. Bảng
--          giá đổi về sau không được làm xê dịch hoa hồng của gói đã bán, nên
--          `allocated_per_session` là ảnh chụp, không phải tham chiếu.
--   §3b.5  Tiền khách trả (`price`) và giá trị buổi dùng từ gói
--          (`allocated_value`) là hai chỉ tiêu khác nhau. Báo cáo doanh thu chỉ
--          cộng cái thứ nhất — buổi dùng từ gói không sinh thêm doanh thu, tiền
--          đã thu từ hôm bán gói rồi.
--   §3b.6  Mọi thay đổi số buổi đi qua ledger. `used_sessions` chỉ là **cache**
--          do trigger ghi; không ai được UPDATE thẳng vào nó.

CREATE TYPE "CustomerPackageStatus" AS ENUM ('active', 'used_up', 'expired', 'cancelled');

-- grant  : cấp buổi (bán gói, hoặc chuyển từ phần mềm cũ)
-- use    : khách dùng một buổi
-- adjust : sửa tay, luôn phải kèm lý do
-- expire : hết hạn, thu hồi phần chưa dùng
-- cancel : huỷ gói, hoàn lại
CREATE TYPE "PackageTxnType" AS ENUM ('grant', 'use', 'adjust', 'expire', 'cancel');

-- ───────────────────────────── Gói đã bán ─────────────────────────────

CREATE TABLE customer_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,

  -- Gói trong danh mục. Để NULL được vì bản chuyển từ hệ cũ có thể trỏ tới gói
  -- đã bị xoá khỏi danh mục — mất liên kết thì vẫn còn `package_name`.
  package_id uuid REFERENCES products(id) ON DELETE RESTRICT,

  code text NOT NULL,
  -- Ảnh chụp tên lúc bán: đổi tên gói trong danh mục không được làm đổi giấy tờ
  -- của những lần bán đã xong.
  package_name text NOT NULL,

  sold_at date NOT NULL,
  expires_at date,
  -- Tiền khách thật sự trả cho gói này (§3b.5 — `sale_amount`).
  price numeric(14, 2) NOT NULL DEFAULT 0,

  status "CustomerPackageStatus" NOT NULL DEFAULT 'active',

  -- Khác NULL nghĩa là hàng chuyển từ phần mềm cũ, không phải bán ở đây.
  migrated_at timestamptz,
  note text,

  -- §3b.1 — ai *bấm* thì trỏ users, ai *làm* thì trỏ employees (ở bảng ledger).
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX customer_packages_tenant_code_key ON customer_packages (tenant_id, code);
CREATE INDEX customer_packages_customer_idx ON customer_packages (customer_id, status);
CREATE INDEX customer_packages_tenant_status_idx ON customer_packages (tenant_id, status);

-- ──────────────────── Buổi của từng dịch vụ trong gói ────────────────────

CREATE TABLE customer_package_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_package_id uuid NOT NULL REFERENCES customer_packages(id) ON DELETE CASCADE,
  service_id uuid REFERENCES products(id) ON DELETE RESTRICT,
  service_name text NOT NULL,

  sessions integer NOT NULL,
  bonus_sessions integer NOT NULL DEFAULT 0,

  -- §3b.4 — chốt lúc bán, không tính lại từ giá hiện hành bao giờ.
  allocated_per_session numeric(14, 2) NOT NULL DEFAULT 0,

  -- §3b.6 — CACHE. Trigger dưới đây là thứ duy nhất được ghi vào cột này.
  used_sessions integer NOT NULL DEFAULT 0,

  /*
   * Buổi mà KiotViet đang **giữ chỗ cho một lịch hẹn** lúc chuyển sang.
   *
   * Cột "SL còn lại" của KiotViet đã trừ phần này, nên gói vẫn bị đánh dấu "Đã
   * dùng hết" dù khách chưa làm buổi nào trong số đó — đúng 7 buổi của 2 gói
   * rơi vào tình cảnh ấy. Buổi đã đặt nhưng chưa làm thì spa vẫn còn nợ, nên ở
   * đây nó nằm trong `sessions` như buổi bình thường; con số này chỉ để biết
   * ngày xưa nó được giữ cho ai. Khi có lịch hẹn (M2) thì việc giữ chỗ do
   * `booking_item` đảm nhiệm và cột này thành sử liệu.
   */
  migrated_reserved_sessions integer NOT NULL DEFAULT 0,

  sort_order integer NOT NULL DEFAULT 0,

  CONSTRAINT customer_package_items_sessions_positive CHECK (sessions > 0),
  CONSTRAINT customer_package_items_bonus_not_negative CHECK (bonus_sessions >= 0),
  -- Không cho dùng quá số buổi đã bán. Đây là lời hứa với khách, để cơ sở dữ
  -- liệu giữ chứ đừng giao cho mã ứng dụng nhớ.
  CONSTRAINT customer_package_items_used_within_bounds
    CHECK (used_sessions >= 0 AND used_sessions <= sessions + bonus_sessions)
);

CREATE INDEX customer_package_items_package_idx ON customer_package_items (customer_package_id);
CREATE INDEX customer_package_items_service_idx ON customer_package_items (service_id);

-- ───────────────────────── Sổ cái trừ buổi (§3b.6) ─────────────────────────

CREATE TABLE package_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_package_item_id uuid NOT NULL
    REFERENCES customer_package_items(id) ON DELETE CASCADE,

  type "PackageTxnType" NOT NULL,
  -- Có dấu: cấp thì dương, dùng thì âm. Số buổi còn lại = SUM(quantity).
  quantity integer NOT NULL,

  -- §3b.5 — giá trị buổi dùng từ gói, KHÔNG phải doanh thu. Chốt từ
  -- `allocated_per_session` tại thời điểm trừ buổi.
  allocated_value numeric(14, 2) NOT NULL DEFAULT 0,

  occurred_at timestamptz NOT NULL DEFAULT now(),

  -- §3b.1 — người *làm* dịch vụ là nhân viên; người *bấm nút* là tài khoản.
  performer_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,

  -- Lịch hẹn và hoá đơn chưa có (M2/M3). Để sẵn cột, chưa ràng buộc khoá ngoại;
  -- khi hai bảng kia ra đời thì thêm FK bằng migration riêng.
  booking_item_id uuid,
  invoice_item_id uuid,

  note text,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Dấu của `quantity` phải khớp loại giao dịch, nếu không sổ cái tự mâu thuẫn.
  CONSTRAINT package_transactions_quantity_sign CHECK (
    (type = 'grant'  AND quantity > 0) OR
    (type = 'use'    AND quantity < 0) OR
    (type = 'expire' AND quantity < 0) OR
    (type = 'cancel' AND quantity < 0) OR
    (type = 'adjust' AND quantity <> 0)
  ),
  -- Sửa tay mà không nói lý do thì ba tháng sau không ai giải thích được con số.
  CONSTRAINT package_transactions_adjust_needs_reason CHECK (
    type <> 'adjust' OR (note IS NOT NULL AND btrim(note) <> '')
  )
);

CREATE INDEX package_transactions_item_idx
  ON package_transactions (customer_package_item_id, occurred_at);
CREATE INDEX package_transactions_tenant_occurred_idx
  ON package_transactions (tenant_id, occurred_at);
CREATE INDEX package_transactions_performer_idx
  ON package_transactions (performer_employee_id, occurred_at);

-- ──────────────────── Trigger giữ cache khớp sổ cái ────────────────────
--
-- Bài học từ `categories.path` (PROGRESS.md 07/09): giá trị suy ra được thì
-- đừng để mã ứng dụng ghi. Ở đó một cột mang hai nghĩa suốt nhiều ngày mà không
-- ai biết. Ở đây con số là số buổi khách đã trả tiền — sai thì mất lòng khách.

-- Số buổi còn lại là **tổng có dấu của sổ cái**; số buổi đã dùng suy ra từ đó.
-- Viết theo chiều này thì một giao dịch `adjust` dương (trả lại buổi cho khách)
-- tự động làm giảm `used_sessions`, không cần thêm luật riêng.
CREATE OR REPLACE FUNCTION sync_customer_package_usage() RETURNS trigger AS $$
DECLARE
  target_item uuid := COALESCE(NEW.customer_package_item_id, OLD.customer_package_item_id);
BEGIN
  UPDATE customer_package_items i
  SET used_sessions = i.sessions + i.bonus_sessions - (
        SELECT COALESCE(SUM(t.quantity), 0)
        FROM package_transactions t
        WHERE t.customer_package_item_id = i.id
      )
  WHERE i.id = target_item;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER package_transactions_sync_usage
AFTER INSERT OR UPDATE OR DELETE ON package_transactions
FOR EACH ROW EXECUTE FUNCTION sync_customer_package_usage();

-- ──────────────────── Trạng thái gói theo số buổi còn lại ────────────────────

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
  SET status = CASE WHEN remaining <= 0 THEN 'used_up' ELSE 'active' END,
      updated_at = now()
  WHERE id = pkg AND status IN ('active', 'used_up');

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customer_package_items_sync_status
AFTER INSERT OR UPDATE OF used_sessions, sessions, bonus_sessions OR DELETE
ON customer_package_items
FOR EACH ROW EXECUTE FUNCTION sync_customer_package_status();
