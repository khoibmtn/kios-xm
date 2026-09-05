-- M1 — Danh mục hàng hoá
--
-- Bốn loại hàng hoá dùng chung một bảng vì trên màn hình bán hàng chúng nằm
-- cạnh nhau trong cùng một giỏ. Điều đó có nghĩa nhiều cột chỉ có ý nghĩa với
-- một loại, nên phần cuối tệp này đặt ràng buộc CHECK để cơ sở dữ liệu tự từ
-- chối những kết hợp vô nghĩa — thay vì trông chờ mọi đoạn mã đều nhớ luật.

CREATE TYPE "ProductKind" AS ENUM ('product', 'service', 'package', 'card');
CREATE TYPE "ValidityType" AS ENUM ('days', 'months', 'fixed_date', 'unlimited');

-- ───────────────────────── Danh mục phụ trợ ─────────────────────────

CREATE TABLE categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  parent_id   uuid REFERENCES categories(id) ON DELETE CASCADE,
  path        text NOT NULL DEFAULT '',
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz(6) NOT NULL DEFAULT now()
);
-- Hai nhóm cùng tên được phép nếu khác nhánh cha; NULLS NOT DISTINCT để
-- ràng buộc có hiệu lực cả với nhóm gốc (parent_id IS NULL).
CREATE UNIQUE INDEX categories_tenant_parent_name_key
  ON categories (tenant_id, parent_id, name) NULLS NOT DISTINCT;
CREATE INDEX categories_tenant_path_idx ON categories (tenant_id, path);

CREATE TABLE brands (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX brands_tenant_name_key ON brands (tenant_id, name);

CREATE TABLE units (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX units_tenant_name_key ON units (tenant_id, name);

-- ───────────────────────── Hàng hoá ─────────────────────────

CREATE TABLE products (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code              text NOT NULL,
  name              text NOT NULL,
  kind              "ProductKind" NOT NULL,

  category_id       uuid REFERENCES categories(id) ON DELETE SET NULL,
  brand_id          uuid REFERENCES brands(id) ON DELETE SET NULL,
  unit_id           uuid REFERENCES units(id) ON DELETE SET NULL,

  base_price        numeric(14,2) NOT NULL DEFAULT 0,
  cost              numeric(14,2) NOT NULL DEFAULT 0,

  description       text,
  image_file_ids    uuid[],

  duration_minutes  integer,                                    -- service

  validity_type     "ValidityType" DEFAULT 'unlimited',          -- package | card
  validity_value    integer,

  card_face_value   numeric(14,2),                               -- card
  card_bonus_value  numeric(14,2) DEFAULT 0,

  track_inventory   boolean NOT NULL DEFAULT false,              -- product
  min_quantity      numeric(14,3),
  max_quantity      numeric(14,3),

  allows_sale       boolean NOT NULL DEFAULT true,
  is_active         boolean NOT NULL DEFAULT true,
  attributes        jsonb,

  created_at        timestamptz(6) NOT NULL DEFAULT now(),
  updated_at        timestamptz(6) NOT NULL DEFAULT now(),

  -- Dịch vụ bắt buộc có thời lượng: thiếu nó thì không xếp được lên lưới lịch hẹn
  CONSTRAINT products_service_needs_duration CHECK (
    kind <> 'service' OR (duration_minutes IS NOT NULL AND duration_minutes > 0)
  ),
  -- Thẻ tài khoản bắt buộc có mệnh giá, và không âm
  CONSTRAINT products_card_needs_face_value CHECK (
    kind <> 'card' OR (card_face_value IS NOT NULL AND card_face_value >= 0)
  ),
  -- Chỉ hàng vật lý mới theo dõi tồn kho
  CONSTRAINT products_only_product_tracks_inventory CHECK (
    kind = 'product' OR track_inventory = false
  ),
  -- Hạn dùng theo ngày/tháng thì phải có số; vô thời hạn thì không
  CONSTRAINT products_validity_value_matches_type CHECK (
    validity_type IN ('unlimited', 'fixed_date') OR validity_value IS NOT NULL
  ),
  CONSTRAINT products_price_non_negative CHECK (base_price >= 0 AND cost >= 0)
);
CREATE UNIQUE INDEX products_tenant_code_key ON products (tenant_id, code);
CREATE INDEX products_tenant_kind_idx ON products (tenant_id, kind, is_active);
CREATE INDEX products_tenant_category_idx ON products (tenant_id, category_id);
-- Tìm kiếm theo tên có dấu lẫn không dấu
CREATE INDEX products_name_trgm_idx ON products USING gin (name gin_trgm_ops);

CREATE TABLE product_variants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku         text NOT NULL,
  attributes  jsonb NOT NULL,
  base_price  numeric(14,2),
  cost        numeric(14,2),
  is_active   boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX product_variants_sku_key ON product_variants (product_id, sku);

CREATE TABLE package_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id      uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  service_id      uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  sessions        integer NOT NULL,
  bonus_sessions  integer NOT NULL DEFAULT 0,
  retail_price    numeric(14,2) NOT NULL,
  sort_order      integer NOT NULL DEFAULT 0,

  CONSTRAINT package_items_sessions_positive CHECK (sessions > 0 AND bonus_sessions >= 0),
  CONSTRAINT package_items_retail_price_positive CHECK (retail_price > 0),
  CONSTRAINT package_items_no_self_reference CHECK (package_id <> service_id)
);
CREATE UNIQUE INDEX package_items_key ON package_items (package_id, service_id);

CREATE TABLE service_materials (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id   uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  material_id  uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity     numeric(14,3) NOT NULL,

  CONSTRAINT service_materials_quantity_positive CHECK (quantity > 0),
  CONSTRAINT service_materials_no_self_reference CHECK (service_id <> material_id)
);
CREATE UNIQUE INDEX service_materials_key ON service_materials (service_id, material_id);

-- ───────────────────────── Bảng giá & tồn kho ─────────────────────────

CREATE TABLE price_books (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id  uuid REFERENCES branches(id) ON DELETE CASCADE,
  name       text NOT NULL,
  starts_at  timestamptz,
  ends_at    timestamptz,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz(6) NOT NULL DEFAULT now(),

  CONSTRAINT price_books_period_valid CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX price_books_tenant_idx ON price_books (tenant_id, is_active);

CREATE TABLE price_book_items (
  price_book_id uuid NOT NULL REFERENCES price_books(id) ON DELETE CASCADE,
  product_id    uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price         numeric(14,2) NOT NULL CHECK (price >= 0)
);
CREATE UNIQUE INDEX price_book_items_key ON price_book_items (price_book_id, product_id);

CREATE TABLE inventory (
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  branch_id  uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  on_hand    numeric(14,3) NOT NULL DEFAULT 0,
  reserved   numeric(14,3) NOT NULL DEFAULT 0,
  updated_at timestamptz(6) NOT NULL DEFAULT now(),

  CONSTRAINT inventory_reserved_non_negative CHECK (reserved >= 0)
);
CREATE UNIQUE INDEX inventory_key ON inventory (product_id, branch_id);

-- ───────────────────── Ràng buộc liên bảng ─────────────────────

-- Chỉ gói mới có thành phần, và thành phần bắt buộc phải là dịch vụ.
-- Kiểm ở tầng cơ sở dữ liệu vì đây là bất biến nghiệp vụ, không phải quy ước.
CREATE OR REPLACE FUNCTION check_package_item_kinds() RETURNS trigger AS $$
BEGIN
  IF (SELECT kind FROM products WHERE id = NEW.package_id) <> 'package' THEN
    RAISE EXCEPTION 'package_id phải trỏ tới hàng hoá loại "package"';
  END IF;
  IF (SELECT kind FROM products WHERE id = NEW.service_id) <> 'service' THEN
    RAISE EXCEPTION 'service_id phải trỏ tới hàng hoá loại "service"';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER package_items_kind_check
  BEFORE INSERT OR UPDATE ON package_items
  FOR EACH ROW EXECUTE FUNCTION check_package_item_kinds();

-- Định mức nguyên vật liệu: chủ thể là dịch vụ, vật tư là hàng vật lý.
CREATE OR REPLACE FUNCTION check_service_material_kinds() RETURNS trigger AS $$
BEGIN
  IF (SELECT kind FROM products WHERE id = NEW.service_id) <> 'service' THEN
    RAISE EXCEPTION 'service_id phải trỏ tới hàng hoá loại "service"';
  END IF;
  IF (SELECT kind FROM products WHERE id = NEW.material_id) <> 'product' THEN
    RAISE EXCEPTION 'material_id phải trỏ tới hàng hoá loại "product"';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER service_materials_kind_check
  BEFORE INSERT OR UPDATE ON service_materials
  FOR EACH ROW EXECUTE FUNCTION check_service_material_kinds();
