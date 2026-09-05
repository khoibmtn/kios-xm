import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { branches, tenants } from './index'

/**
 * Danh mục hàng hoá — phần lõi nghiệp vụ của spa.
 *
 * Trục thiết kế quan trọng nhất là **bốn loại hàng hoá** (`kind`), quan sát
 * trực tiếp từ bốn tab trên màn hình thu ngân của KiotViet Salon
 * (`docs/research/01-module-map.md` §3):
 *
 *   product  — hàng vật lý (mỹ phẩm bán lẻ): có tồn kho, giá vốn
 *   service  — buổi làm dịch vụ: có **thời lượng** và định mức nguyên vật liệu
 *   package  — gói/liệu trình: bán trước N buổi, trừ dần
 *   card     — thẻ tài khoản: trả trước theo **số tiền**, trừ dần
 *
 * Chúng khác nhau về nghiệp vụ nhưng dùng chung một bảng, vì trên màn hình bán
 * hàng chúng nằm cạnh nhau trong cùng một giỏ và cùng một dòng hoá đơn.
 */

export const productKind = pgEnum('ProductKind', ['product', 'service', 'package', 'card'])

/** Hạn dùng của gói/thẻ tính theo cách nào. */
export const validityType = pgEnum('ValidityType', ['days', 'months', 'fixed_date', 'unlimited'])

// ───────────────────────── Danh mục phụ trợ ─────────────────────────

/**
 * Nhóm hàng, nhiều cấp.
 * `path` lưu sẵn đường dẫn ("Chăm sóc da/Trị mụn") để hiển thị và lọc theo
 * nhánh mà không phải truy hồi đệ quy mỗi lần.
 */
export const categories = pgTable(
  'categories',
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    parentId: uuid('parent_id'),
    path: text().notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { precision: 6, withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('categories_tenant_parent_name_key').on(t.tenantId, t.parentId, t.name),
    index('categories_tenant_path_idx').on(t.tenantId, t.path),
  ],
)

export const brands = pgTable(
  'brands',
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [uniqueIndex('brands_tenant_name_key').on(t.tenantId, t.name)],
)

/** Đơn vị tính: chai, hộp, lọ, buổi… */
export const units = pgTable(
  'units',
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [uniqueIndex('units_tenant_name_key').on(t.tenantId, t.name)],
)

// ───────────────────────── Hàng hoá ─────────────────────────

export const products = pgTable(
  'products',
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    /** Mã hiển thị cho người dùng: SP000244. Sinh tự động, sửa được. */
    code: text().notNull(),
    name: text().notNull(),
    kind: productKind().notNull(),

    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    brandId: uuid('brand_id').references(() => brands.id, { onDelete: 'set null' }),
    unitId: uuid('unit_id').references(() => units.id, { onDelete: 'set null' }),

    /** Giá niêm yết. Bảng giá riêng (price_books) sẽ đè lên khi có. */
    basePrice: numeric('base_price', { precision: 14, scale: 2 }).notNull().default('0'),
    /** Giá vốn — cập nhật theo phương pháp bình quân khi nhập hàng. */
    cost: numeric({ precision: 14, scale: 2 }).notNull().default('0'),

    description: text(),
    imageFileIds: uuid('image_file_ids').array(),

    // ── Chỉ dùng cho kind='service' ──
    /** Thời lượng một buổi, tính bằng phút. Quyết định độ dài khối trên lưới lịch hẹn. */
    durationMinutes: integer('duration_minutes'),

    // ── Chỉ dùng cho kind='package' hoặc 'card' ──
    validityType: validityType('validity_type').default('unlimited'),
    /** Số ngày/tháng hiệu lực, tuỳ `validity_type`. */
    validityValue: integer('validity_value'),

    // ── Chỉ dùng cho kind='card' ──
    /** Mệnh giá thẻ — số tiền khách trả. */
    cardFaceValue: numeric('card_face_value', { precision: 14, scale: 2 }),
    /** Tiền tặng thêm. Số dư ban đầu = mệnh giá + tặng thêm. */
    cardBonusValue: numeric('card_bonus_value', { precision: 14, scale: 2 }).default('0'),

    // ── Chỉ dùng cho kind='product' ──
    trackInventory: boolean('track_inventory').notNull().default(false),
    minQuantity: numeric('min_quantity', { precision: 14, scale: 3 }),
    maxQuantity: numeric('max_quantity', { precision: 14, scale: 3 }),

    allowsSale: boolean('allows_sale').notNull().default(true),
    isActive: boolean('is_active').notNull().default(true),
    attributes: jsonb(),

    createdAt: timestamp('created_at', { precision: 6, withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { precision: 6, withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('products_tenant_code_key').on(t.tenantId, t.code),
    index('products_tenant_kind_idx').on(t.tenantId, t.kind, t.isActive),
    index('products_tenant_category_idx').on(t.tenantId, t.categoryId),
  ],
)

/** Hàng nhiều thuộc tính: cùng một sản phẩm nhưng khác dung tích, màu… */
export const productVariants = pgTable(
  'product_variants',
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    sku: text().notNull(),
    attributes: jsonb().notNull(),
    basePrice: numeric('base_price', { precision: 14, scale: 2 }),
    cost: numeric({ precision: 14, scale: 2 }),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [uniqueIndex('product_variants_sku_key').on(t.productId, t.sku)],
)

/**
 * Thành phần của một gói dịch vụ.
 *
 * Ba cột giá trị phân bổ là điểm quan trọng nhất của bảng này (ADR-001 §1.3).
 * Gói nhiều loại dịch vụ không thể chia đều giá: một buổi laser 1,5 triệu và
 * một buổi chăm sóc da 300 nghìn không thể cùng được coi là 416 nghìn. Giá gói
 * được phân bổ **theo tỷ trọng giá bán lẻ**, và kết quả được **chốt lại tại
 * thời điểm bán** — về sau giá lẻ có đổi cũng không làm thay đổi hoa hồng hay
 * báo cáo của những gói đã bán.
 */
export const packageItems = pgTable(
  'package_items',
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    packageId: uuid('package_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),

    sessions: integer().notNull(),
    /** Buổi tặng thêm — không tính vào giá trị phân bổ. */
    bonusSessions: integer('bonus_sessions').notNull().default(0),

    /** Giá lẻ của dịch vụ tại thời điểm cấu hình gói — cơ sở để phân bổ. */
    retailPrice: numeric('retail_price', { precision: 14, scale: 2 }).notNull(),

    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [uniqueIndex('package_items_key').on(t.packageId, t.serviceId)],
)

/**
 * Định mức nguyên vật liệu cho một dịch vụ.
 * Làm xong một buổi thì trừ kho mỹ phẩm theo đúng định mức này.
 */
export const serviceMaterials = pgTable(
  'service_materials',
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    materialId: uuid('material_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    quantity: numeric({ precision: 14, scale: 3 }).notNull(),
  },
  (t) => [uniqueIndex('service_materials_key').on(t.serviceId, t.materialId)],
)

// ───────────────────────── Bảng giá ─────────────────────────

export const priceBooks = pgTable(
  'price_books',
  {
    id: uuid().primaryKey().defaultRandom().notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }),
    endsAt: timestamp('ends_at', { withTimezone: true, mode: 'date' }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { precision: 6, withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('price_books_tenant_idx').on(t.tenantId, t.isActive)],
)

export const priceBookItems = pgTable(
  'price_book_items',
  {
    priceBookId: uuid('price_book_id')
      .notNull()
      .references(() => priceBooks.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    price: numeric({ precision: 14, scale: 2 }).notNull(),
  },
  (t) => [uniqueIndex('price_book_items_key').on(t.priceBookId, t.productId)],
)

/** Tồn kho theo chi nhánh — chỉ có ý nghĩa với `kind='product'`. */
export const inventory = pgTable(
  'inventory',
  {
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    onHand: numeric('on_hand', { precision: 14, scale: 3 }).notNull().default('0'),
    /** Đã được giữ chỗ cho lịch hẹn/đơn chưa hoàn tất. */
    reserved: numeric({ precision: 14, scale: 3 }).notNull().default('0'),
    updatedAt: timestamp('updated_at', { precision: 6, withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex('inventory_key').on(t.productId, t.branchId)],
)

export { sql }
