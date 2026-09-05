# ADR-001 — Chỉnh sửa thiết kế sau phản biện chéo

**Ngày**: 05/09/2026 · **Trạng thái**: Đề xuất, chờ anh Khôi duyệt
**Bối cảnh**: Bản thiết kế `02-system-design.md` được ChatGPT phản biện. Tài liệu này ghi
lại đánh giá từng điểm: **tiếp thu**, **tiếp thu có điều chỉnh**, hay **phản biện lại**.

---

## PHẦN 1 — BA LỖI KIẾN TRÚC THẬT (bắt buộc sửa trước khi code)

### 1.1 ❌ Lỗi: `performer_id` trỏ sai bảng

**Phản biện đúng.** Tài liệu của tôi tự mâu thuẫn: Phần D viết "nhân viên tách khỏi tài khoản
đăng nhập — một KTV có thể không có tài khoản mà vẫn được gán lịch và tính hoa hồng",
nhưng data model lại ghi `booking_items.performer_id -> users`.

Nếu để nguyên, đến M6 (nhân sự/hoa hồng) phải migrate lại toàn bộ `bookings` và `invoices`.

**Sửa:**

```sql
-- Ghi nhận NGHIỆP VỤ → luôn trỏ employees
booking_items.assigned_employee_id     -> employees.id
invoice_item_employees.employee_id     -> employees.id
invoices.cashier_employee_id           -> employees.id

-- Ghi nhận THAO TÁC PHẦN MỀM → trỏ users
*.created_by_user_id                   -> users.id
*.updated_by_user_id                   -> users.id
```

> Hai khái niệm khác nhau: **Employee** = người được ghi nhận nghiệp vụ (có thể không có
> tài khoản). **User** = người bấm nút trên phần mềm.

### 1.2 ❌ Lỗi: hai nguồn sự thật giữa `booking_items` và `invoice_items`

**Phản biện đúng.** Tôi đã *phát hiện* vấn đề khi khảo sát (ghi trong `01-module-map.md`:
"phải là cùng một thực thể hoặc liên kết 1-1") nhưng data model lại **lặp lại cả 5 trường**
(`product_id`, `performer`, `resource`, `starts_at`, `ends_at`) ở cả hai bảng. Đây là công
thức tạo bug đồng bộ.

**Sửa — có điều chỉnh so với đề xuất của ChatGPT:**

```
booking_item  1 ─── 0..1  invoice_item     (invoice_items.booking_item_id, UNIQUE)
```

| Trường | Nguồn sự thật | Lý do |
|---|---|---|
| `starts_at`, `ends_at`, `resource_id` | **booking_item** | Đây là tài nguyên bị chiếm dụng theo thời gian — ràng buộc chống trùng nằm ở đây |
| `assigned_employee_id` | **booking_item** | Dùng cho chống trùng lịch KTV |
| `unit_price`, `discount`, `line_total` | **invoice_item** | Dữ liệu tài chính |
| **người thực sự làm** | **invoice_item_employees** | ⬅ **điểm tôi phản biện, xem 2.1** |

**Quy tắc**: dịch vụ **luôn** sinh `booking_item` (kể cả khách vãng lai làm ngay — đúng như
KiotViet: gán giờ là tự tạo lịch). Sản phẩm bán mang về **không** có `booking_item`.

### 1.3 ❌ Lỗi: công thức phân bổ giá trị gói

**Phản biện đúng, và đây là lỗi nghiêm trọng nhất về nghiệp vụ.** Tôi đề xuất
`giá gói ÷ tổng số buổi` — chỉ đúng khi gói có **một** loại dịch vụ.

Ví dụ ChatGPT đưa ra rất thuyết phục:

| Gói 5.000.000 | Số buổi | Giá lẻ | Tổng giá lẻ |
|---|---|---|---|
| Chăm sóc da | 10 | 300.000 | 3.000.000 |
| Laser | 2 | 1.500.000 | 3.000.000 |
| | **12 buổi** | | **6.000.000** |

Công thức cũ: mọi buổi = `5.000.000 / 12` = **416.667** → buổi laser (giá lẻ 1,5 triệu) và
buổi chăm sóc da (300k) được coi ngang giá. Sai cả cho hoa hồng lẫn báo cáo hiệu suất.

**Sửa — phân bổ theo tỷ trọng giá bán lẻ:**

```
                                  retail_price_i × sessions_i
allocated_value_i = package_price × ─────────────────────────────
                                   Σ(retail_price × sessions)

allocated_session_value_i = allocated_value_i / sessions_i
```

Kết quả đúng: chăm sóc da **250.000/buổi**, laser **1.250.000/buổi**.

**Bổ sung của tôi — ba tình huống ChatGPT chưa nêu:**

| Tình huống | Xử lý |
|---|---|
| Dịch vụ **chỉ bán trong gói**, không có giá lẻ | Bắt buộc nhập `retail_price` khi đóng gói; nếu bỏ trống → fallback `equal_per_session` và cảnh báo |
| **Buổi tặng thêm** (bonus) | `allocated_value = 0` cho doanh thu (tránh tổng phân bổ > giá gói), nhưng `commission_base` vẫn > 0 theo chính sách — nếu không KTV làm buổi tặng sẽ không có thu nhập |
| Σ giá lẻ = 0 (nhập thiếu) | Chặn lưu gói, không cho tạo dữ liệu hỏng |

**Không hard-code một công thức.** KiotViet cho cấu hình cách ghi nhận doanh thu dịch vụ
trong gói, nên:

```sql
tenant_settings.package_revenue_allocation_mode
  = 'proportional_retail'   -- mặc định (khuyến nghị)
  | 'equal_per_session'
  | 'custom'
```

Và **lưu snapshot** vào `customer_package_items` khi bán (`allocated_total_value`,
`allocated_session_value`) — không tính lại từ giá hiện tại về sau.

---

## PHẦN 2 — TIẾP THU CÓ ĐIỀU CHỈNH (tôi phản biện lại một phần)

### 2.1 Nhiều KTV cùng làm một dịch vụ — đồng ý bảng junction, **không đồng ý ràng buộc tổng ≤ 1**

Đồng ý bỏ `performer_id` đơn lẻ, dùng bảng junction. Nhưng đề xuất G14
*"tổng contribution_ratio ≤ 1"* **không khớp thực tế spa**.

Tình huống thật: thợ chính hưởng 100% mức hoa hồng của mình, thợ phụ hưởng 30% mức của
**thợ phụ** — tổng hệ số là 1,3 nhưng hoàn toàn hợp lệ vì hai người áp **hai mức khác nhau**.

**Đề xuất của tôi — tách hai chế độ:**

```sql
invoice_item_employees(
  invoice_item_id, employee_id,
  role ENUM('performer_primary','performer_assistant','consultant'),
  contribution_ratio numeric      -- hệ số nhân vào base
)

commission_rules.allocation_mode ENUM(
  'split'        -- chia doanh thu: Σ ratio của cùng role PHẢI = 1
  'independent'  -- mỗi người tính độc lập theo mức của role mình: Σ có thể ≠ 1
)
```

| Chế độ | Ví dụ | Ràng buộc |
|---|---|---|
| `split` | Massage 4 tay, 2 KTV chia đôi | Σ ratio (cùng role) = 1 |
| `independent` | Thợ chính 1,0 + thợ phụ 0,3 | Không ràng buộc tổng |

⇒ **G14 sửa lại**: *"Với `allocation_mode='split'`, Σ `contribution_ratio` của cùng một
`role` trên một `invoice_item` phải bằng 1."*

### 2.2 Người **được phân công** ≠ người **thực sự làm**

ChatGPT đề xuất `booking_item` là nguồn sự thật cho `performer_employee_id`.
**Tôi phản biện**: đây là hai giai đoạn nghiệp vụ khác nhau.

```
Lúc đặt lịch     →  booking_item.assigned_employee_id   = KTV DỰ KIẾN
                    (dùng để chống trùng lịch)
Lúc làm xong     →  invoice_item_employees              = KTV THỰC SỰ LÀM
                    (dùng để tính hoa hồng)
```

Thực tế spa: KTV nghỉ đột xuất, đổi người phút chót, lễ tân không kịp sửa lịch. Nếu hoa hồng
lấy từ `booking_item` thì **trả tiền cho người không làm**.

**Quy tắc**: khi hoàn tất, nếu hai bên khác nhau → vẫn cho phép, ghi `audit_log` và (tuỳ
cấu hình) cập nhật ngược lại `booking_item` để lịch sử lịch hẹn phản ánh đúng.

### 2.3 Lộ trình — đồng ý sửa dependency, **không đồng ý gộp hết vào M3**

ChatGPT đúng: M3 (POS) đang phụ thuộc chức năng của M4/M5/M6 — bán hàng thì phải trừ gói,
trừ thẻ, trừ kho, ghi hoa hồng. Đây là lỗi lộ trình thật.

Nhưng gộp toàn bộ vào một M3 sẽ tạo ra milestone khổng lồ, khó nghiệm thu và khó biết khi
nào xong. **Đề xuất của tôi: tách M3 thành hai lát cắt dọc, mỗi lát đều chạy được thật.**

| M | Nội dung | Nghiệm thu |
|---|---|---|
| **M3.1 · POS lõi** | Hoá đơn, dòng hàng, thanh toán nhiều phương thức, phiếu thu sổ quỹ, `stock_moves` do bán sản phẩm + tiêu hao NVL dịch vụ, in hoá đơn | Bán được 1 sản phẩm + 1 dịch vụ, tồn kho và sổ quỹ khớp |
| **M3.2 · Tài sản khách & hoa hồng lõi** | `customer_packages` + `package_transactions`, `customer_cards` + `card_transactions`, `commission_entries` (3 vai trò) | Bán gói 10 buổi → dùng 1 buổi → còn 9, hoa hồng ghi đúng |

Cả M3.1 và M3.2 **phải xong trước M4**. Roadmap mới:

```
M0  Nền móng (auth, RBAC chi tiết, audit log, outbox, 5 mẫu màn hình)
M1  Danh mục (4 loại hàng, định mức NVL, cấu hình gói/thẻ, commission_rules)
M2  Lịch hẹn (3 view: ngày/tuần/theo KTV · chống trùng · ca làm việc)
M3.1 POS lõi
M3.2 Gói/Thẻ + hoa hồng lõi
M4  Phòng khám + quản trị gói/thẻ nâng cao        ← ưu tiên sớm theo yêu cầu
M5  Kho & mua hàng đầy đủ (NCC, nhập, kiểm kho, giá vốn bình quân)
M6  Nhân sự nâng cao (ca, chấm công, bảng lương) + /me: Lịch của tôi & Thu nhập
M7  Báo cáo
M8  CSKH
M9  Đặt lịch online + PWA đầy đủ
```

*(Đã tiếp thu gợi ý đưa 2 màn hình `/me` lên M6 thay vì chờ M9.)*

### 2.4 "Giao dịch nguyên tử 8 bước" — đồng ý làm rõ ranh giới

ChatGPT đúng rằng không thể đưa lệnh gọi Zalo/SMS vào cùng transaction Postgres.
Nhưng cần chính xác: **cả 8 bước tôi liệt kê đều là thao tác nội bộ DB** (kể cả "sinh QR
đánh giá" = tạo bản ghi + token). Việc *gửi tin nhắn* mới là bên ngoài, và nó không nằm
trong 8 bước đó.

Dù vậy, tiếp thu **outbox pattern** vì sớm muộn cũng cần:

```
BEGIN
  ├ invoice → completed
  ├ package_transactions / card_transactions
  ├ stock_moves
  ├ commission_entries
  ├ cash_transactions
  ├ loyalty_transactions
  └ outbox_events('SEND_RATING_LINK', 'SEND_THANKYOU_ZALO')
COMMIT
   ↓
Worker đọc outbox → gọi Zalo/SMS → đánh dấu đã gửi (idempotent, có retry)
```

---

## PHẦN 3 — TIẾP THU HOÀN TOÀN

| # | Điểm | Sửa gì |
|---|---|---|
| 3.1 | **Ledger cho gói** | Thêm `package_transactions` (purchase · use · refund · bonus · adjustment_plus · adjustment_minus · expiry_extension · transfer). Không UPDATE trực tiếp `used_sessions`. Nhất quán với `card_transactions` đã có |
| 3.2 | **debt/balance là giá trị cache** | `customers.debt`, `suppliers.debt`, `cash_accounts.balance` chỉ là cache; nguồn sự thật là ledger. Tính lại được bất cứ lúc nào |
| 3.3 | **Tách 3 chỉ tiêu tiền** | `sale_amount` (tiền khách trả) · `service_allocated_value` (giá trị buổi dùng từ gói) · `commission_base` (cơ sở tính hoa hồng). Dashboard chỉ cộng `sale_amount` → tránh double-count 6 triệu bán gói + 6 triệu dùng gói = 12 triệu ảo |
| 3.4 | **Hoá đơn: khoá tài chính, mở attribution** | Sửa G6. Bất biến: hàng hoá, SL, đơn giá, giảm giá, tổng tiền, thanh toán. Sửa được (có quyền + audit + tính lại hoa hồng): NV tư vấn, KTV thực hiện, ghi chú. Nếu kỳ lương đã chốt → không sửa trực tiếp, phải tạo bút toán điều chỉnh kỳ sau |
| 3.5 | **Quyền chi tiết thay 3 cờ** | `financial.view_revenue/view_cost/view_profit` · `employee.view_own_income/view_all_income` · `invoice.change_completed_attribution` · `invoice.override_discount_limit` · `package.override_interval/extend_expiry/adjust_sessions` |
| 3.6 | **Tách quyền y tế theo tầng** | `medical.alert_view` (lễ tân: chỉ thấy ⚠ "có chống chỉ định") · `medical.record_view` (xem chẩn đoán, tiền sử) · `medical.record_edit` · `medical.image_view`. `customer.view` **không** kéo theo quyền y tế |
| 3.7 | **Slot lịch cấu hình được** | `tenant_settings.booking_slot_minutes` ∈ {15, 30, 60}, mặc định 30. Không hard-code |
| 3.8 | **Lịch hẹn có view theo KTV** | M2 có 3 chế độ: Ngày · Tuần · **Theo KTV** (cột = KTV). Trả lời câu hỏi thật của spa: "14h ai rảnh?" |
| 3.9 | **Ảnh gắn tới `booking_item`** | `customer_albums(booking_id, booking_item_id NULL, clinical_visit_id NULL, …)` — một lần khách đến có thể làm 3 dịch vụ, ảnh phải biết thuộc dịch vụ nào |
| 3.10 | **Công nợ là capability, không phải module** | Xuyên suốt Khách hàng → Hoá đơn → Sổ quỹ và NCC → Nhập hàng → Sổ quỹ. Không tạo menu riêng ở giai đoạn đầu |

---

## PHẦN 4 — BỘ QUY TẮC BẤT BIẾN CẬP NHẬT (12 → 17)

Giữ G1–G12, sửa G6 và G14, thêm G13–G17:

| # | Quy tắc | Cưỡng chế |
|---|---|---|
| G6′ | Hoá đơn `completed`: **trường tài chính** bất biến; **attribution** sửa được với quyền + audit + tính lại hoa hồng | Trigger + service |
| G13 | `invoice_item.booking_item_id` (nếu có) phải cùng `tenant`, `branch`, `customer` với hoá đơn | CHECK + FK ghép |
| G14′ | Với `allocation_mode='split'`: Σ `contribution_ratio` cùng `role` trên một dòng = 1 | Trigger |
| G15 | Mọi thay đổi số buổi phải qua `package_transactions`; cấm UPDATE trực tiếp `used_sessions` | Trigger chặn |
| G16 | `commission_entries` lưu **snapshot** của rule (`rule_id`, `calc`, `value`, `base_amount`). Sửa bảng hoa hồng **không** làm đổi hoa hồng lịch sử | Cột snapshot + không FK cứng |
| G17 | Tổng `allocated_value` của các `package_items` = `package_price` (sai số ≤ 1đ do làm tròn) | CHECK khi bán gói |

---

## PHẦN 5 — ĐIỂM TÔI PHẢN BIỆN VỀ HẠ TẦNG

ChatGPT khuyến nghị **chốt Supabase Pro $25/tháng ngay từ M0**. Không phù hợp với yêu cầu
mới của anh Khôi (chi phí tối thiểu, ưu tiên gói miễn phí). Chi tiết ở
[`ADR-002`](./ADR-002-infrastructure.md).

Riêng điểm ChatGPT nêu về **backup thì đúng và tôi nhận lỗi**: yêu cầu phi chức năng của tôi
ghi *"sao lưu hàng ngày, giữ 30 ngày, khôi phục theo thời điểm"* mà không đối chiếu với
thực tế gói dịch vụ. Supabase Free **không có backup nào cả**. Đã sửa trong ADR-002.

---

## TÓM TẮT THAY ĐỔI CẦN ÁP DỤNG

**Bắt buộc trước khi viết dòng code đầu tiên:**
1. `performer/consultant/cashier` → `employees`; `created_by/updated_by` → `users`
2. `invoice_items.booking_item_id` + phân định nguồn sự thật
3. Phân bổ giá gói theo tỷ trọng giá lẻ + snapshot + xử lý 3 edge case
4. `invoice_item_employees` (junction) với `role` + `contribution_ratio` + `allocation_mode`
5. `package_transactions` (ledger)
6. Tách `sale_amount` / `service_allocated_value` / `commission_base`
7. Roadmap: chèn M3.1 và M3.2 trước M4

**Làm trong M0 (rẻ nếu làm sớm, đắt nếu làm sau):**
8. RBAC chi tiết + 4 quyền y tế theo tầng
9. `outbox_events` + worker
10. `tenant_settings.booking_slot_minutes`
11. `audit_log` cho mọi thay đổi tiền & lịch & hồ sơ y tế
