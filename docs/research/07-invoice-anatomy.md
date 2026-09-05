# Giải phẫu hoá đơn (từ hoá đơn thật đã hoàn tất)

Quan sát hoá đơn `HD000586` — 510 hoá đơn trong tài khoản, tổng doanh số
`409.137.200`, giảm giá `52.070.750`, sau giảm giá `357.066.450`.

## 1. Danh sách hoá đơn

**Bộ chọn thời gian** (mẫu UI rất đáng học — dùng lại cho mọi bộ lọc thời gian):

```
┌──────────┬───────────┬────────────┬───────────┬───────────┐
│ Theo ngày│ Theo tuần │ Theo tháng │ Theo quý  │ Theo năm  │
├──────────┼───────────┼────────────┼───────────┼───────────┤
│ Hôm nay  │ Tuần này  │ Tháng này  │ Quý này   │ Năm nay   │
│ Hôm qua  │ Tuần trước│ Tháng trước│ Quý trước │ Năm trước │
└──────────┴───────────┴────────────┴───────────┴───────────┘
  Toàn thời gian                        (+ "Lựa chọn khác" = chọn khoảng ngày)
```

**Bộ lọc**: Thời gian · Trạng thái (`Hoàn thành`) · **Còn nợ** (Từ–Tới) ·
Nhân viên thực hiện · Nhân viên tư vấn · Kênh bán (+Tạo mới) · Phương thức ·
Bảng giá · Loại thu khác.

**Cột**: `Mã hoá đơn` · `Thời gian` · `Khách hàng` · `Tổng tiền hàng` · `Giảm giá` ·
`Tổng sau giảm giá` (+ dòng tổng ghim đầu bảng).

## 2. Chi tiết hoá đơn (mở rộng inline)

Hai tab: **Tổng quan** · **Lịch sử thanh toán**

### 2.1 Tab Tổng quan

```
Bạn Hằng CTCH - 0963318966  🔗   [Hoàn thành]     Chi nhánh: Chi nhánh trung tâm
🧾 HD000586  │  🏷 Bảng giá chung                  Người tạo: BS Hương Xumay

Thu ngân            Thời gian tạo         Kênh bán               Mã tra cứu HĐĐT
Chưa xác định       20/08/2026 07:56      Khách đến trực tiếp    Chưa có

┌ Ghi chú ─────────────────────────────────────────────────────────┐
│                      Chưa có ghi chú                             │
└──────────────────────────────────────────────────────────────────┘

Mã hàng hóa │ Tên hàng                        │ SL │ Đơn giá  │ Giảm giá      │ Giá bán │ Thành tiền
SP000219    │ TD MD Care Vitamin C Arbutin-   │ 1  │ 790,000  │ 20% (158,000) │ 632,000 │ 632,000
            │ 30ml (Lọ)                       │
            │   • Tư vấn bán ✏️                │
SP000240    │ SVR Cleanser Gel Lavant-1000ml  │ 1  │1,050,000 │ 500,000       │ 550,000 │ 550,000
            │ (Chai)  • Tư vấn bán ✏️          │

                                      Tổng số lượng:      2
                                      Tổng tiền hàng:     1,182,000
                                      Giảm giá hóa đơn:   0
                                      Khách cần trả:      1,182,000
                                      Khách đã trả:       1,182,000

[🗑 Hủy bỏ] [Sao chép] [Xuất file]                              [🖨 In]
```

**Điểm cần lưu vào mô hình:**

| Quan sát | Hệ quả thiết kế |
|---|---|
| Giảm giá dòng ghi cả `%` và số tiền: `20% (158,000)` | `invoice_items.discount_ratio` + `discount_amount`, lưu cả hai |
| Có cả `Giảm giá hóa đơn` riêng | `invoices.discount_ratio` + `discount_amount` |
| `Đơn giá` → `Giá bán` (sau giảm) → `Thành tiền` | 3 cột riêng, `Giá bán = Đơn giá − Giảm giá` |
| `Bảng giá` gắn với hoá đơn | `invoices.price_book_id` |
| `Thu ngân` tách khỏi `Người tạo` | `invoices.cashier_id` ≠ `created_by` |
| `Kênh bán` = "Khách đến trực tiếp" | `invoices.sale_channel_id` |
| `Mã tra cứu HĐĐT` | `invoices.einvoice_lookup_code` |
| Sub-line `• Tư vấn bán ✏️` sửa được sau khi hoàn tất | Cho phép sửa `consultant_id` sau bán → phải tính lại hoa hồng |
| Hành động: `Hủy bỏ` (không phải xoá) · `Sao chép` · `Xuất file` · `In` | Hoá đơn bất biến, chỉ đổi trạng thái sang `cancelled` |

### 2.2 Tab Lịch sử thanh toán

| Mã phiếu | Thời gian | Tài khoản tạo | Phương thức | Trạng thái | Tiền thu |
|---|---|---|---|---|---|
| **TTHD000586** | 20/08/2026 07:56 | BS Hương Xumay | Tiền mặt | Đã thanh toán | 1,182,000 |

⭐ **Mã phiếu thu = `TT` + mã hoá đơn**, và là **link** sang phiếu thu trong Sổ quỹ.

⇒ **Bất biến quan trọng**: mỗi lần thanh toán hoá đơn **sinh một phiếu thu trong sổ quỹ**.
Hoá đơn ⇄ Sổ quỹ phải luôn khớp. Trong kios-xm:

```
payments(id, invoice_id, method, amount, paid_at, created_by, status)
  └─ mỗi payment sinh 1 cash_transactions(direction='in', invoice_id, code='TT'||invoice.code)
```

Một hoá đơn có thể có **nhiều dòng thanh toán** (trả nhiều lần / nhiều phương thức)
→ bảng `payments` là 1-n, và `invoices.paid_amount = Σ payments.amount`.

## 3. Quy ước mã chứng từ quan sát được

| Loại | Tiền tố | Ví dụ |
|---|---|---|
| Hoá đơn | `HD` | HD000586 |
| Phiếu thanh toán hoá đơn | `TT` + mã HĐ | TTHD000586 |
| Hàng hoá | `SP` | SP000244 |
| Khách hàng | `KH` | KH000086 |
| Nhân viên | `NV` | NV000001 |
| Bảng lương | `BL` | BL000021 |

→ kios-xm dùng cùng quy ước: `{prefix}{6 chữ số}`, sequence riêng theo tenant.

## 4. Dữ liệu thật để đối chiếu khi migrate

- 510 hoá đơn · 196 hàng hoá (199 mã) · 81 khách hàng · 21 bảng lương · 12 kênh bán
- Quỹ đầu kỳ tháng 9/2026: `267.340.950`
- Có hoá đơn giá trị `0` (HD000581, HD000582) → nhiều khả năng là **dùng buổi từ gói**
  hoặc **thanh toán bằng thẻ tài khoản** ⇒ mô hình phải cho phép hoá đơn tổng tiền 0.
