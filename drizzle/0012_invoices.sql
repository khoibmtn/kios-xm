-- Hoá đơn, thanh toán và sổ quỹ.
--
-- Thiết kế bám hoá đơn thật đã mổ xẻ (`docs/research/07-invoice-anatomy.md`)
-- và ba quy tắc của `AGENTS.md` §3b:
--
--   §3b.2  Mỗi dịch vụ trên hoá đơn **trỏ về một `booking_item` đã có**, quan
--          hệ 1-1. Thời gian và phòng có nguồn sự thật ở lịch hẹn; giá và giảm
--          giá ở đây. Không có dịch vụ nào được bán mà không có dòng lịch.
--   §3b.3  Nhiều người cùng làm một dịch vụ thì tách ra bảng riêng kèm tỷ lệ
--          đóng góp — không nhét mảng vào một cột.
--   §3b.5  **Ba chỉ tiêu tiền phải tách bạch**: tiền khách trả (`line_total`),
--          giá trị buổi dùng từ gói (`allocated_value`), và cơ sở tính hoa
--          hồng. Báo cáo doanh thu chỉ cộng cái thứ nhất — buổi dùng từ gói
--          không sinh thêm doanh thu, tiền đã thu từ hôm bán gói rồi.
--
-- Và một bất biến quan sát trực tiếp từ KiotViet: **mỗi lần thanh toán hoá đơn
-- sinh một phiếu thu trong sổ quỹ**, mã `TT` + mã hoá đơn. Hoá đơn và sổ quỹ
-- phải luôn khớp — nên việc đó do trigger làm, không giao cho mã ứng dụng nhớ.

CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'completed', 'cancelled');
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'bank', 'wallet', 'card_balance', 'points', 'voucher');
CREATE TYPE "CashDirection" AS ENUM ('in', 'out');
CREATE TYPE "CashAccountKind" AS ENUM ('cash', 'bank', 'wallet');
CREATE TYPE "CommissionRole" AS ENUM ('performer', 'consultant', 'cashier');

-- ─────────────────────── Danh mục phụ trợ ───────────────────────

CREATE TABLE sale_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sale_channels_tenant_name_key ON sale_channels (tenant_id, name);

CREATE TABLE cash_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  kind "CashAccountKind" NOT NULL,
  name text NOT NULL,
  /*
   * Số dư là **cache** tính lại được từ `cash_transactions` (§3b.6), giữ ở đây
   * để màn hình sổ quỹ không phải cộng cả bảng mỗi lần mở.
   */
  balance numeric(14, 2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cash_accounts_tenant_name_key ON cash_accounts (tenant_id, name);

-- ───────────────────────────── Hoá đơn ─────────────────────────────

CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,

  code text NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE RESTRICT,
  guest_name text,

  status "InvoiceStatus" NOT NULL DEFAULT 'draft',
  sale_channel_id uuid REFERENCES sale_channels(id) ON DELETE SET NULL,
  price_book_id uuid REFERENCES price_books(id) ON DELETE SET NULL,

  /** Tổng tiền hàng trước giảm giá hoá đơn. */
  subtotal numeric(14, 2) NOT NULL DEFAULT 0,
  discount_ratio numeric(5, 2) NOT NULL DEFAULT 0,
  discount_amount numeric(14, 2) NOT NULL DEFAULT 0,
  /** §3b.5 — `sale_amount`: tiền khách phải trả. Chỉ số này vào doanh thu. */
  total numeric(14, 2) NOT NULL DEFAULT 0,

  /**
   * §3b.5 — tổng giá trị buổi khách dùng từ gói trong hoá đơn này.
   * KHÔNG phải doanh thu: tiền đã thu từ hôm bán gói. Để riêng vì hoa hồng kỹ
   * thuật viên vẫn tính trên nó.
   */
  service_allocated_value numeric(14, 2) NOT NULL DEFAULT 0,

  /** Cache từ `payments` — trigger giữ, đừng UPDATE thẳng. */
  paid_amount numeric(14, 2) NOT NULL DEFAULT 0,

  note text,
  einvoice_lookup_code text,

  -- §3b.1 — thu ngân là *nhân viên*, người tạo là *tài khoản*. Hoá đơn thật của
  -- KiotViet tách hai ô này, và chúng khác nhau thật.
  cashier_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,

  issued_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  cancel_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT invoices_has_someone CHECK (
    customer_id IS NOT NULL OR (guest_name IS NOT NULL AND btrim(guest_name) <> '')
  ),
  -- Hoá đơn tổng tiền 0 là **hợp lệ** (dùng buổi từ gói, trả bằng thẻ) — đã
  -- thấy hai hoá đơn như vậy trong dữ liệu thật. Chỉ cấm số âm.
  CONSTRAINT invoices_amounts_not_negative CHECK (
    subtotal >= 0 AND discount_amount >= 0 AND total >= 0
    AND service_allocated_value >= 0 AND paid_amount >= 0
  ),
  CONSTRAINT invoices_discount_ratio_range CHECK (discount_ratio >= 0 AND discount_ratio <= 100),
  CONSTRAINT invoices_cancel_needs_reason CHECK (
    status <> 'cancelled'
    OR (cancelled_at IS NOT NULL AND cancel_note IS NOT NULL AND btrim(cancel_note) <> '')
  )
);

CREATE UNIQUE INDEX invoices_tenant_code_key ON invoices (tenant_id, code);
CREATE INDEX invoices_customer_idx ON invoices (customer_id, issued_at);
CREATE INDEX invoices_branch_issued_idx ON invoices (branch_id, issued_at);
CREATE INDEX invoices_tenant_status_idx ON invoices (tenant_id, status);

CREATE TABLE invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  product_id uuid REFERENCES products(id) ON DELETE RESTRICT,
  /** Ảnh chụp lúc bán — đổi tên hàng không sửa lại hoá đơn đã xuất. */
  product_name text NOT NULL,
  unit_name text,

  /*
   * §3b.2 — liên kết chính thức sang lịch hẹn, **1-1**. UNIQUE chứ không phải
   * chỉ khoá ngoại: một buổi đã hẹn chỉ được bán đúng một lần, và đó là thứ
   * ngăn một dịch vụ bị tính tiền hai lần khi lễ tân bấm nhầm hai lượt.
   */
  booking_item_id uuid REFERENCES booking_items(id) ON DELETE SET NULL,

  quantity numeric(14, 3) NOT NULL DEFAULT 1,
  unit_price numeric(14, 2) NOT NULL DEFAULT 0,
  discount_ratio numeric(5, 2) NOT NULL DEFAULT 0,
  discount_amount numeric(14, 2) NOT NULL DEFAULT 0,
  /** Đơn giá sau giảm. Hoá đơn thật hiện cả ba cột, nên lưu cả ba. */
  sale_price numeric(14, 2) NOT NULL DEFAULT 0,
  line_total numeric(14, 2) NOT NULL DEFAULT 0,

  /** Buổi trừ từ gói khách đang giữ, nếu dòng này dùng gói. */
  customer_package_item_id uuid REFERENCES customer_package_items(id) ON DELETE SET NULL,
  /** §3b.5 — giá trị buổi dùng từ gói. Không cộng vào doanh thu. */
  allocated_value numeric(14, 2) NOT NULL DEFAULT 0,

  note text,
  sort_order integer NOT NULL DEFAULT 0,

  CONSTRAINT invoice_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT invoice_items_amounts_not_negative CHECK (
    unit_price >= 0 AND discount_amount >= 0 AND sale_price >= 0
    AND line_total >= 0 AND allocated_value >= 0
  ),
  CONSTRAINT invoice_items_discount_ratio_range CHECK (
    discount_ratio >= 0 AND discount_ratio <= 100
  )
);

CREATE UNIQUE INDEX invoice_items_booking_item_key
  ON invoice_items (booking_item_id) WHERE booking_item_id IS NOT NULL;
CREATE INDEX invoice_items_invoice_idx ON invoice_items (invoice_id);
CREATE INDEX invoice_items_product_idx ON invoice_items (product_id);

/*
 * §3b.3 — nhiều người cùng ăn hoa hồng trên một dòng.
 *
 * `commission_base` chốt tại đây chứ không tính lại lúc chạy báo cáo: sửa bảng
 * hoa hồng sang năm không được làm đổi hoa hồng đã trả (§3b.7).
 */
CREATE TABLE invoice_item_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_item_id uuid NOT NULL REFERENCES invoice_items(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  role "CommissionRole" NOT NULL,
  contribution_ratio numeric(5, 4) NOT NULL DEFAULT 1,
  commission_base numeric(14, 2) NOT NULL DEFAULT 0,

  CONSTRAINT invoice_item_employees_ratio_range CHECK (
    contribution_ratio > 0 AND contribution_ratio <= 1
  )
);
CREATE UNIQUE INDEX invoice_item_employees_key
  ON invoice_item_employees (invoice_item_id, employee_id, role);

-- ──────────────────────── Thanh toán & sổ quỹ ────────────────────────

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  code text NOT NULL,
  method "PaymentMethod" NOT NULL,
  amount numeric(14, 2) NOT NULL,
  cash_account_id uuid REFERENCES cash_accounts(id) ON DELETE SET NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  note text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT payments_amount_positive CHECK (amount > 0)
);
CREATE UNIQUE INDEX payments_tenant_code_key ON payments (tenant_id, code);
CREATE INDEX payments_invoice_idx ON payments (invoice_id);

CREATE TABLE cash_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  cash_account_id uuid REFERENCES cash_accounts(id) ON DELETE SET NULL,

  code text NOT NULL,
  direction "CashDirection" NOT NULL,
  amount numeric(14, 2) NOT NULL,

  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  /*
   * Phiếu sinh từ thanh toán thì xoá theo thanh toán. Sổ quỹ đúng chuẩn phải
   * bất biến và huỷ bằng bút toán ngược — việc đó thuộc M7; ở giai đoạn này
   * giữ hai bảng khớp nhau quan trọng hơn.
   */
  payment_id uuid REFERENCES payments(id) ON DELETE CASCADE,

  counterpart text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  note text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cash_transactions_amount_positive CHECK (amount > 0)
);
CREATE UNIQUE INDEX cash_transactions_tenant_code_key ON cash_transactions (tenant_id, code);
CREATE INDEX cash_transactions_account_idx ON cash_transactions (cash_account_id, occurred_at);
CREATE INDEX cash_transactions_invoice_idx ON cash_transactions (invoice_id);

-- ──────────────── Bất biến: thanh toán ⇒ phiếu thu sổ quỹ ────────────────

CREATE OR REPLACE FUNCTION payment_creates_cash_receipt() RETURNS trigger AS $$
DECLARE
  inv RECORD;
BEGIN
  SELECT code, branch_id, customer_id INTO inv FROM invoices WHERE id = NEW.invoice_id;

  INSERT INTO cash_transactions
    (tenant_id, branch_id, cash_account_id, code, direction, amount,
     invoice_id, payment_id, counterpart, occurred_at, created_by_user_id)
  VALUES
    (NEW.tenant_id, inv.branch_id, NEW.cash_account_id, NEW.code, 'in', NEW.amount,
     NEW.invoice_id, NEW.id,
     (SELECT name FROM customers WHERE id = inv.customer_id),
     NEW.paid_at, NEW.created_by_user_id);

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payments_create_cash_receipt
AFTER INSERT ON payments
FOR EACH ROW EXECUTE FUNCTION payment_creates_cash_receipt();

-- ──────────────── Cache: đã trả bao nhiêu, quỹ còn bao nhiêu ────────────────

CREATE OR REPLACE FUNCTION sync_invoice_paid_amount() RETURNS trigger AS $$
DECLARE
  target uuid := COALESCE(NEW.invoice_id, OLD.invoice_id);
BEGIN
  UPDATE invoices
  SET paid_amount = (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE invoice_id = target),
      updated_at = now()
  WHERE id = target;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payments_sync_invoice
AFTER INSERT OR UPDATE OR DELETE ON payments
FOR EACH ROW EXECUTE FUNCTION sync_invoice_paid_amount();

CREATE OR REPLACE FUNCTION sync_cash_account_balance() RETURNS trigger AS $$
DECLARE
  target uuid := COALESCE(NEW.cash_account_id, OLD.cash_account_id);
BEGIN
  IF target IS NULL THEN RETURN NULL; END IF;

  UPDATE cash_accounts
  SET balance = (
    SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0)
    FROM cash_transactions WHERE cash_account_id = target
  )
  WHERE id = target;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cash_transactions_sync_balance
AFTER INSERT OR UPDATE OR DELETE ON cash_transactions
FOR EACH ROW EXECUTE FUNCTION sync_cash_account_balance();

-- ─────────────────────── Dữ liệu khởi tạo ───────────────────────
-- Ba loại quỹ theo `docs/research/` và kênh bán mặc định quan sát được.

INSERT INTO cash_accounts (tenant_id, branch_id, kind, name)
SELECT t.id, (SELECT id FROM branches WHERE tenant_id = t.id ORDER BY created_at LIMIT 1),
       a.kind::"CashAccountKind", a.name
FROM tenants t
CROSS JOIN (VALUES ('cash', 'Tiền mặt'), ('bank', 'Ngân hàng'), ('wallet', 'Ví điện tử'))
  AS a(kind, name)
ON CONFLICT DO NOTHING;

INSERT INTO sale_channels (tenant_id, name, sort_order)
SELECT t.id, c.name, c.sort_order
FROM tenants t
CROSS JOIN (VALUES ('Khách đến trực tiếp', 1), ('Facebook', 2), ('Zalo', 3), ('Giới thiệu', 4))
  AS c(name, sort_order)
ON CONFLICT DO NOTHING;
