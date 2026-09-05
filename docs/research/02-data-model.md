# Mô hình dữ liệu

Phần A ghi lại **schema thật quan sát được từ API KiotViet Salon** (làm bằng chứng nghiệp vụ).
Phần B là **mô hình đề xuất cho kios-xm** — đã chuẩn hoá lại, không sao chép nguyên trạng.

---

## A. Schema quan sát được từ KiotViet Salon

### A1. Product — `GET /v2/inventory/products`

Các trường thu được từ response thật (tên nguyên gốc):

```
id, code, masterCode, name, fullName, customId, customValue
categoryId, categoryName, categoryNameTree        # nhóm hàng (cây)
tradeMarkId, tradeMarkName                        # thương hiệu
productType, productGroup, groupProductType       # phân loại
basePrice, cost, latestPurchasePrice              # giá bán / giá vốn / giá nhập gần nhất
onHand, reserved, minQuantity, maxQuantity        # tồn kho
onHandCompareMin, onHandCompareMax
unit, unitListStr, conversionValue                # đơn vị + quy đổi
duration                                          # ⭐ THỜI LƯỢNG DỊCH VỤ
expireTime, expireType                            # ⭐ hạn dùng của gói/thẻ
isServicePackage                                  # ⭐ là gói dịch vụ
productCardInfoes                                 # ⭐ cấu hình thẻ tài khoản
productComboInfoes                                # ⭐ thành phần gói/combo
productFormulaString, productFormulaDetailString  # ⭐ định mức nguyên vật liệu
hasVariants, variantCount                         # hàng nhiều thuộc tính
isLotSerialControl                                # quản lý lô / hạn dùng
allowsSale, isActive, isDeleted, isRewardPoint
haveProcessedGoodsChild, orderTemplate, amount
createdDate
```

Endpoint phụ trợ:

| Endpoint | Ý nghĩa |
|---|---|
| `/v2/inventory/products/{id}/images` | ảnh sản phẩm |
| `/v2/inventory/products/{id}/on-hand-by-branch` | tồn theo chi nhánh |
| `/v2/inventory/products/{id}/formulas` | định mức NVL: `{materialId, material, quantity, productFormulaHistoryId}` |
| `/v2/inventory/shelves` | vị trí kệ |
| thẻ kho | `{BranchId, ProductId, DocumentType, DocumentCode, DocumentId, TransDate, Quantity, Price, Cost, HiddenCost, EndingStocks, PartnerName}` |

### A2. Customer — `GET /v2/partner/customers/{id}`

```
id, code, name, type, branchId, retailerId
debt, invoiceCount, sumQuantity, lastTradingDate
totalCard, totalAvailableCard, totalAvailableCardAmount      # ⭐ thẻ tài khoản còn lại
totalAvailableProductCombo, totalAvailableCustomerProductCombo  # ⭐ gói còn lại
customerAddress {address, countryId, objectId, objectType}
customerGroupDetails[]                                       # nhóm KH (n-n)
customerTaxProfile {customerType, useCustomerTaxProfileOnly}
isActive, isDeleted, createdDate, modifiedDate
```

Tab con của khách hàng (mỗi tab là một endpoint riêng — gợi ý cấu trúc hồ sơ KH):

| Endpoint | Nội dung |
|---|---|
| `/customers/{id}/cards` | thẻ tài khoản đã mua, số dư |
| `/customers/{id}/product-combo` | gói dịch vụ/liệu trình đã mua, số buổi còn |
| `/customers/{id}/transaction-history` | lịch sử hoá đơn |
| `/customers/{id}/booking-albums` | ⭐ album ảnh buổi trị liệu (trước/sau) |
| `/customers/{id}/debt` | công nợ: `{DocumentType, DocumentCode, TransDate, Value, Balance}` |
| `/v2/partner/customer-groups` | nhóm khách hàng |

### A3. Cấu hình lương nhân viên (form "Thiết lập lương")

- **Loại lương**: `Theo ca làm việc` · `Theo giờ làm việc` · `Theo ngày công chuẩn` · `Cố định`
- **Mẫu lương**: template dùng lại cho nhiều nhân viên
- **Thưởng**: theo doanh thu (có "loại thưởng" và "hình thức thưởng")
- **Hoa hồng**: theo sản phẩm hoặc dịch vụ, cấu hình qua **Bảng hoa hồng**
- **Phụ cấp**: ăn trưa, đi lại, điện thoại…
- **Giảm trừ**: đi muộn, về sớm, vi phạm nội quy…

**Bảng hoa hồng** (`/p/emp-commission`): nhiều bảng song song (ví dụ "Bảng hoa hồng chung",
"Hoa hồng dịch vụ - tư vấn"), mỗi bảng gán cho tập nhân viên; xem theo *Hàng hoá* hoặc
*Nhân viên áp dụng*; cột: Mã hàng, Tên hàng, ĐVT, Giá bán chung, Giá vốn, Lợi nhuận tạm tính,
+ cột mức hoa hồng.

### A4. Vị trí/phòng
`/api/tablegroups` (nhóm) và `/api/tables` (vị trí). Trường: Tên vị trí/phòng, Ghi chú,
Nhóm, Trạng thái, Số thứ tự.

---

## B. Mô hình đề xuất cho kios-xm (PostgreSQL)

Nguyên tắc: chuẩn hoá tiếng Anh cho tên bảng/cột, tiếng Việt cho nhãn hiển thị.
Mọi bảng nghiệp vụ đều có `tenant_id` (multi-tenant) + `branch_id`.

### B1. Nền tảng

```
tenants(id, name, code, plan, created_at)
branches(id, tenant_id, name, address, phone, timezone, is_default, is_active)
users(id, tenant_id, email, phone, password_hash, full_name, avatar_url, is_active)
roles(id, tenant_id, name, permissions jsonb)
user_branch_roles(user_id, branch_id, role_id)
```

### B2. Danh mục hàng hoá

```
categories(id, tenant_id, name, parent_id, path)
brands(id, tenant_id, name)
products(
  id, tenant_id, code UNIQUE, name, category_id, brand_id,
  kind ENUM('product','service','package','card'),   -- 4 loại lõi
  unit, base_price, cost, is_active, allows_sale,
  image_urls text[], description,
  -- riêng product
  track_inventory bool, min_qty, max_qty, weight numeric, shelf_id,
  -- riêng service
  duration_minutes int,
  -- riêng package: "Thời hạn, lịch trình"
  validity_mode ENUM('unlimited','specific_date','duration'),
  validity_until date, validity_days int,
  schedule_mode ENUM('free','fixed'),                -- UI gốc: "Lịch sử dụng: Tự do"
  -- riêng card
  card_face_value numeric,        -- "Giá bán"        (khách trả)
  card_usable_value numeric,      -- "Mệnh giá sử dụng" (được tiêu; chênh lệch = tặng)
  created_at, updated_at
)
product_variants(id, product_id, sku, attributes jsonb, base_price, cost)
package_items(
  id, package_id -> products, service_id -> products,
  sessions int, unit_price, retail_price,            -- giá bán lẻ tại thời điểm đóng gói
  min_days_between_sessions int                      -- "Mỗi buổi cách nhau"
)
-- ⭐ Phạm vi tiêu của thẻ tài khoản (KiotViet: "Phạm vi thanh toán")
card_scopes(
  id, product_id,                                    -- product.kind = 'card'
  scope_kind ENUM('kind','category','product'),
  target_kind ENUM('product','service','package') NULL,
  category_id NULL, target_product_id NULL
)
service_materials(id, service_id -> products, material_id -> products, quantity numeric)
price_books(id, tenant_id, name, starts_at, ends_at, is_active)
price_book_items(price_book_id, product_id, price)
```

### B3. Kho

```
inventory(product_id, branch_id, on_hand numeric, reserved numeric)
stock_moves(
  id, tenant_id, branch_id, product_id, qty numeric, unit_cost numeric,
  doc_type ENUM('purchase','purchase_return','invoice','sale_return',
                'stock_take','damage','internal_use','service_consume'),
  doc_id, doc_code, occurred_at, ending_stock numeric
)
suppliers(id, tenant_id, code, name, phone, email, address, debt numeric)
purchase_orders(id, tenant_id, branch_id, code, supplier_id, status, total, paid, note, created_at)
purchase_order_items(po_id, product_id, qty, unit_price, discount)
stock_takes(id, branch_id, code, status, note, balanced_at)
stock_take_items(stock_take_id, product_id, system_qty, counted_qty)
```

### B4. Khách hàng & CSKH

```
customers(
  id, tenant_id, code UNIQUE, name, phone, email, gender, birthday,
  address, ward, province, note, customer_type ENUM('individual','company'),
  tax_code, debt numeric, loyalty_points int, total_spent numeric,
  first_visit_at, last_visit_at, visit_count int, source, is_active
)
customer_groups(id, tenant_id, name, auto_rule jsonb)
customer_group_members(customer_id, group_id)
customer_notes(id, customer_id, author_id, body, created_at)          -- hồ sơ da/dị ứng
customer_albums(id, customer_id, booking_id, taken_at, kind ENUM('before','after'), image_urls text[])
```

### B5. Gói dịch vụ & thẻ trả trước (lõi spa)

```
customer_packages(                       -- gói/liệu trình đã bán
  id, tenant_id, customer_id, product_id, invoice_id,
  purchased_at, expires_at, status ENUM('active','used_up','expired','refunded'), note
)
customer_package_items(                  -- từng dịch vụ trong gói + số buổi
  id, customer_package_id, service_id, total_sessions int, used_sessions int, bonus_sessions int
)
customer_package_usages(                 -- nhật ký trừ buổi
  id, customer_package_item_id, booking_id, invoice_id, used_at, sessions int, performed_by
)
customer_cards(                          -- thẻ tài khoản trả trước
  id, tenant_id, customer_id, product_id, invoice_id, card_no,
  face_value numeric, bonus_value numeric, balance numeric,
  issued_at, expires_at, status
)
card_transactions(id, customer_card_id, invoice_id, amount numeric, kind ENUM('topup','spend','refund','adjust'), occurred_at)
```

### B6. Lịch hẹn (booking)

```
resources(id, tenant_id, branch_id, name, group_id, kind ENUM('room','bed','device'), sort_order, is_active)
resource_groups(id, tenant_id, name)

bookings(
  id, tenant_id, branch_id, code, customer_id,
  starts_at timestamptz, ends_at timestamptz,
  status ENUM('pending','confirmed','arrived','in_progress','done','cancelled','no_show'),
  source ENUM('pos','admin','online','zalo','phone'),
  note, cancel_reason, invoice_id,
  recurrence_id,                        -- lịch định kỳ
  created_by, created_at
)
booking_items(
  id, booking_id, product_id,           -- dịch vụ
  starts_at, ends_at, duration_minutes,
  resource_id,                          -- phòng/giường
  performer_id  -> users,               -- KTV làm dịch vụ
  consultant_id -> users,               -- NV tư vấn bán
  customer_package_item_id,             -- nếu trừ buổi từ gói
  price numeric, status
)
booking_recurrences(id, rule text, until date)     -- RRULE
```

### B7. Bán hàng

```
invoices(
  id, tenant_id, branch_id, code, customer_id, booking_id,
  status ENUM('draft','completed','cancelled'),
  subtotal, discount_amount, discount_ratio, tax_amount, total,
  paid_amount, debt_amount, sale_channel_id,
  cashier_id, sold_by_id, note, created_at, completed_at
)
invoice_items(
  id, invoice_id, product_id, variant_id, qty numeric,
  unit_price, discount, line_total,
  performer_id, consultant_id,          -- ⭐ 2 vai trò hoa hồng
  resource_id, starts_at, ends_at,      -- ⭐ nếu là dịch vụ có lịch
  customer_package_item_id,             -- nếu dùng buổi từ gói (giá 0)
  note
)
payments(id, invoice_id, method ENUM('cash','card','transfer','qr','card_balance','points'),
         amount numeric, reference, customer_card_id, paid_at)
sale_returns(id, tenant_id, branch_id, code, invoice_id, customer_id, total, reason, created_at)
sale_return_items(return_id, invoice_item_id, product_id, qty, unit_price)
sale_channels(id, tenant_id, name, is_active)
```

### B8. Khuyến mại

```
promotions(id, tenant_id, name, kind ENUM('invoice_discount','product_discount','gift','points'),
           starts_at, ends_at, conditions jsonb, actions jsonb, is_active, priority)
vouchers(id, tenant_id, campaign_id, code UNIQUE, value numeric, kind ENUM('amount','percent'),
         min_order numeric, used_at, used_invoice_id, expires_at, status)
voucher_campaigns(id, tenant_id, name, quantity, prefix, starts_at, ends_at)
```

### B9. Nhân viên

```
employees(id, tenant_id, user_id, code, clock_code, department_id, position_id,
          hired_at, id_number, bank_account, bank_name, status)
departments(id, tenant_id, name)
positions(id, tenant_id, name)
shifts(id, tenant_id, name, start_time, end_time, break_minutes)
employee_schedules(id, employee_id, branch_id, work_date, shift_id, status)
attendances(id, employee_id, work_date, clock_in, clock_out, source, note)
salary_templates(id, tenant_id, name, config jsonb)
employee_salaries(
  id, employee_id, effective_from,
  salary_type ENUM('per_shift','per_hour','per_standard_day','fixed'),
  base_amount numeric, template_id,
  allowances jsonb, deductions jsonb, bonus_rules jsonb
)
-- ⭐ BA vai trò sinh hoa hồng (xác nhận qua báo cáo nhân viên của KiotViet):
--    performer  = "Thực hiện dịch vụ"  → invoice_items.performer_id
--    consultant = "Tư vấn bán hàng"    → invoice_items.consultant_id
--    cashier    = "Thu ngân"           → invoices.cashier_id
commission_tables(id, tenant_id, name, scope ENUM('system','branch'), branch_id NULL, is_default)
commission_table_employees(table_id, employee_id)
commission_rules(
  id, table_id, product_id NULL, category_id NULL,      -- áp theo hàng hoặc theo nhóm
  role ENUM('performer','consultant','cashier'),
  calc ENUM('percent_revenue','percent_profit','fixed_amount'),  -- UI gốc: VND | %
  value numeric
)
commission_entries(                                     -- kết quả tính, ghi khi hoàn tất hoá đơn
  id, employee_id, invoice_item_id, role, base_amount, rate, amount, period, locked bool
)
payrolls(id, tenant_id, branch_id, period_start, period_end, status)
payroll_lines(payroll_id, employee_id, base, commission, bonus, allowance, deduction, advance, net)
employee_advances(id, employee_id, amount, reason, created_at)
```

### B10. Sổ quỹ & báo cáo

```
cash_accounts(id, tenant_id, branch_id, name, kind ENUM('cash','bank'), balance numeric)
cash_transactions(
  id, tenant_id, branch_id, account_id, code,
  direction ENUM('in','out'), amount numeric, category_id,
  partner_type ENUM('customer','supplier','employee','other'), partner_id,
  invoice_id, note, occurred_at, created_by
)
cash_categories(id, tenant_id, name, direction)
end_of_day_reports(id, branch_id, business_date, opening, cash_in, cash_out, closing, note, closed_by)
service_ratings(id, booking_item_id, customer_id, employee_id, score int, comment, created_at)
```

### B11. Chỉ mục tối thiểu

```sql
CREATE INDEX ON bookings (tenant_id, branch_id, starts_at);
CREATE INDEX ON booking_items (performer_id, starts_at);
CREATE INDEX ON booking_items (resource_id, starts_at);
CREATE INDEX ON invoices (tenant_id, branch_id, created_at DESC);
CREATE INDEX ON invoice_items (invoice_id);
CREATE INDEX ON stock_moves (product_id, branch_id, occurred_at DESC);
CREATE INDEX ON customers (tenant_id, phone);
CREATE INDEX ON commission_entries (employee_id, period);
```

### B12. Ràng buộc nghiệp vụ cần cưỡng chế ở tầng DB/service

1. Không cho 2 `booking_items` trùng `resource_id` giao nhau về thời gian → dùng
   `EXCLUDE USING gist (resource_id WITH =, tstzrange(starts_at, ends_at) WITH &&)`.
2. Tương tự cho `performer_id` (một KTV không làm 2 việc cùng lúc).
3. `used_sessions <= total_sessions + bonus_sessions` trên `customer_package_items`.
4. `customer_cards.balance >= 0`.
5. Hoá đơn `completed` là bất biến — sửa phải qua phiếu trả hàng/điều chỉnh.
