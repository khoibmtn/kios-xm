# Form tạo hàng hoá — chi tiết 4 loại

Nút `+ Hàng hóa ▾` mở đúng 4 lựa chọn: **Sản phẩm · Dịch vụ · Gói dịch vụ, liệu trình ·
Thẻ tài khoản**. Mỗi loại có form riêng. Tất cả đều có 2 tab:
`Thông tin` và `Hình ảnh, mô tả, ghi chú`.

---

## 1. Dịch vụ — "Tạo dịch vụ"

```
Tên hàng *                          (bắt buộc)
Mã hàng [Tự động]                   Thời lượng [___] Phút     ⭐
Nhóm hàng [+Tạo mới]                Thương hiệu [+Tạo mới]
☑ Cho phép bán

▸ Giá bán, giá vốn
    Giá bán [0] 🏷        Giá vốn [0]

▸ Nguyên liệu tiêu hao                                        ⭐
    "Thiết lập nguyên liệu sử dụng trong quá trình làm dịch vụ"
    [🔍 Thêm nguyên liệu tiêu hao]
    STT | Tên hàng | Số lượng | Giá vốn | Thành tiền

▸ Hoa hồng nhân viên                          2 bảng hoa hồng ›
    "Thiết lập hoa hồng cho nhân viên tư vấn bán, làm dịch vụ"

▸ Quản lý theo đơn vị tính và thuộc tính            [Thiết lập]
    "Tạo nhiều hàng hoá khác đơn vị tính (buổi, ngày) hoặc đặc điểm (chất liệu, mức độ)"

                                        [Bỏ qua]  [Lưu]
```

**Modal "Thiết lập hoa hồng cho nhân viên"**:

| Bảng hoa hồng | Phạm vi áp dụng | Mức hoa hồng |
|---|---|---|
| Bảng hoa hồng chung | Toàn hệ thống | `[0]` **[VND | %]** 🗑 |
| Hoa hồng dịch vụ - tư vấn | Toàn hệ thống | `[+]` |

\+ `Thêm bảng hoa hồng` · `Bỏ áp dụng tất cả` · `Bỏ qua` / `Lưu`

⇒ **Mức hoa hồng cấu hình theo từng hàng hoá × từng bảng**, giá trị là **số tiền (VND)
hoặc phần trăm (%)**, có **phạm vi áp dụng** (toàn hệ thống / theo chi nhánh).

---

## 2. Gói dịch vụ, liệu trình — "Tạo gói dịch vụ, liệu trình"

```
Tên hàng *
Mã hàng [Tự động]                   Nhóm hàng [+Tạo mới]
Thương hiệu [+Tạo mới]

▸ Giá bán, giá vốn
    Giá bán [0] 🏷        Giá vốn [0]  (readonly — tính từ dịch vụ trong gói)

▸ Dịch vụ trong gói                                           ⭐
    "Gói dịch vụ, liệu trình được tạo thành từ các dịch vụ khác nhau"
    [🔍 Thêm dịch vụ trong gói]              [Thêm theo nhóm hàng]
    STT | Tên dịch vụ | Số buổi | Giá vốn | Tổng giá vốn | Giá bán lẻ | Thành tiền | 🗑

▸ Thời hạn, lịch trình                                        ⭐
    Hạn sử dụng   [Vô thời hạn ▾]      Thời gian sử dụng [Không giới hạn thời gian]
    Lịch sử dụng  [Tự do ▾]            Mỗi buổi cách nhau [Tuỳ chọn theo nhu cầu]

▸ Hoa hồng nhân viên                          2 bảng hoa hồng ›
▸ Quản lý theo đơn vị tính và thuộc tính            [Thiết lập]
```

**Giá trị dropdown "Hạn sử dụng"** (đã xác minh): `Vô thời hạn` · `Ngày cụ thể` · `Khoảng thời gian`

**"Lịch sử dụng"**: mặc định `Tự do`; khi đổi sang chế độ cố định thì trường
**"Mỗi buổi cách nhau"** mới nhập được (ví dụ meso mỗi 14 ngày).
→ Trong kios-xm: `min_days_between_sessions int NULL` trên `package_items`.

**Chênh lệch giá**: `Giá bán` của gói thường thấp hơn `Σ(Số buổi × Giá bán lẻ)` → phần
chênh chính là ưu đãi gói. Cần lưu cả 2 để báo cáo.

---

## 3. Thẻ tài khoản — "Tạo thẻ tài khoản"

```
Tên hàng *
Mã hàng [Tự động]                   Nhóm hàng [+Tạo mới]
Thương hiệu [+Tạo mới]

▸ Giá bán, mệnh giá                                           ⭐
    Giá bán [0]              Mệnh giá sử dụng [0]
    (khách trả "Giá bán", được tiêu "Mệnh giá sử dụng" → chênh lệch = tiền tặng)

▸ Phạm vi thanh toán                                          ⭐
    "Tuỳ chọn sản phẩm, dịch vụ, gói dịch vụ được phép thanh toán bằng thẻ tài khoản"
    Loại hàng:  (Sản phẩm) (Dịch vụ) (Gói dịch vụ, liệu trình)   ← chip chọn nhiều
    Nhóm hàng:  [Chọn nhóm hàng]
    Hàng hóa:   [🔍 Tìm hàng hóa]

▸ Thời hạn
    Hạn sử dụng [Vô thời hạn ▾]   Thời gian sử dụng [Không giới hạn thời gian]
```

⇒ Thẻ trả trước **có giới hạn phạm vi tiêu**: chỉ dùng cho một số loại/nhóm/hàng hoá
cụ thể. Đây là chi tiết dễ bỏ sót nhưng rất quan trọng khi thanh toán.

Mô hình hoá trong kios-xm:
```sql
card_scopes(
  id, product_id,                       -- product có kind='card'
  scope_kind ENUM('kind','category','product'),
  target_kind ENUM('product','service','package') NULL,
  category_id NULL, target_product_id NULL
)
```

---

## 4. Sản phẩm — trường quan sát từ màn hình chi tiết

Tabs chi tiết sản phẩm: **Tổng quan · Thẻ kho · Tồn kho · Mô tả, ghi chú**

| Trường | Ví dụ |
|---|---|
| Mã hàng | SP000236 |
| Tồn kho | 20 |
| **Định mức tồn** | `0 - 999,999,999` (min – max) |
| Giá vốn | 11,000 |
| Giá bán | 25,000 |
| Thương hiệu | JM |
| Vị trí | (kệ) |
| **Trọng lượng** | (cho giao hàng) |
| Đơn vị | Miếng (badge) |
| Nhóm hàng | Mặt nạ |

Hành động: `Xóa` · `Sao chép` · `Chỉnh sửa` · `Ngừng kinh doanh` · **`In tem mã`**

---

## 5. Bổ sung vào mô hình dữ liệu

```sql
-- products: thêm
weight numeric,                       -- trọng lượng
shelf_id,                             -- vị trí kệ
card_face_value numeric,              -- giá bán thẻ
card_usable_value numeric,            -- mệnh giá sử dụng (≥ giá bán)

-- package_items: thêm
retail_price numeric,                 -- giá bán lẻ của dịch vụ tại thời điểm đóng gói
min_days_between_sessions int,        -- "mỗi buổi cách nhau"

-- products (package): thêm
schedule_mode ENUM('free','fixed'),   -- "Lịch sử dụng": Tự do / Cố định
validity_mode ENUM('unlimited','specific_date','duration'),
validity_until date,                  -- khi 'specific_date'
validity_days int                     -- khi 'duration'
```
