# Nhân viên · Kho · Báo cáo — chi tiết màn hình

## 1. Nhân viên

### 1.1 Lịch làm việc (`/p/emp-calendar`)

```
Lịch làm việc  [🔍 nhân viên ▾] [◀ Tuần 5 - Th. 8 2026 ▶] [Tuần này]
                        [👤 Xem theo nhân viên ▾] [Import] [Xuất file]
┌──────────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬───────────────┐
│ Nhân viên│ T2 31│ T3 1 │ T4 2 │ T5 3 │ T6 4 │ T7 5 │ CN 6 │ Lương dự kiến │
├──────────┼──────┴──────┴──────┴──────┴──────┴──────┴──────┼───────────────┤
│ Hương    │                                                │Chưa thiết lập │
│ NV000001 │                                                │     lương     │
└──────────┴────────────────────────────────────────────────┴───────────────┘
```
- Ma trận **nhân viên × ngày**, ô = ca được phân.
- Cột chốt phải: **Lương dự kiến** (tính trước theo ca đã phân).
- Chuyển view: `Xem theo nhân viên` ⇄ theo ca.

### 1.2 Bảng chấm công (`/p/emp-clocking`)

```
Bảng chấm công [🔍] [Theo tuần ▾] [◀ Tuần 5 - Th.8 2026 ▶] [Chọn]
                          [📅 Xem theo ca ▾] [Duyệt chấm công] [⋯]
┌───────────────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┐
│ Ca làm việc + │ T2 31│ T3 01│ T4 02│ T5 03│ T6 04│ T7 05│ CN 06│
├───────────────┼──────┴──────┴──────┴──────┴──────┴──────┴──────┤
│ Ca sáng       │                                                │
│ 09:00 - 15:00 │                                                │
│ Ca chiều - tối│                                                │
│ 15:00 - 22:30 │                                                │
└───────────────┴────────────────────────────────────────────────┘
```
**Trạng thái chấm công (5 màu):**
`Đúng giờ` (xanh dương) · `Đi muộn / Về sớm` (tím) · `Chấm công thiếu` (đỏ) ·
`Chưa chấm công` (cam) · `Nghỉ làm` (xám)

Có **quy trình duyệt** (`Duyệt chấm công`) và nút `+` thêm ca ngay trên bảng.
Ca mẫu thật: `Ca sáng 09:00–15:00`, `Ca chiều - tối 15:00–22:30`.

### 1.3 Bảng lương (`/p/emp-paysheet`)

```
Bảng lương  [🔍 mã, tên bảng lương] [⚙]        [+ Bảng tính lương] [Xuất file] [⚙cột]
┌ Sidebar ────────┬ Bảng ──────────────────────────────────────────────────────┐
│ Kỳ hạn trả lương│ Mã │ Tên │ Kỳ hạn trả │ Kỳ làm việc │ Tổng lương │ Đã trả │ Còn cần trả│
│ Trạng thái      │ ── tổng: 19,940,000 ─────────────────────────────────────  │
│ ☑ Đang tạo      │ BL000021 │ Bảng lương tháng 9/2026 │ Hàng tháng │ 01/09–30/09/2026 │
│ ☑ Tạm tính      │ BL000020 │ Bảng lương tháng 8/2026 │ Hàng tháng │ 01/08–31/08/2026 │
│ ☑ Đã chốt lương │ ...                                    (21 bảng lương)     │
│ ☐ Đã hủy        │                                                            │
└─────────────────┴────────────────────────────────────────────────────────────┘
```
**Vòng đời bảng lương**: `Đang tạo` → `Tạm tính` → `Đã chốt lương` (hoặc `Đã hủy`).
Kỳ hạn trả: `Hàng tháng` (còn có nửa tháng/tuần tuỳ cấu hình).

## 2. Kho

### 2.1 Nhập hàng (`/p/purchase-orders`)
- Lọc: `Ngày nhập` · `Trạng thái` (**Phiếu tạm** / **Đã nhập hàng**) · `Chi phí nhập hàng`
- Cột: `Mã nhập hàng` · `Ngày tạo` · `Ngày nhập` · `Nhà cung cấp` · `Cần trả NCC` · `Trạng thái`

### 2.2 Kiểm kho (`/p/stock-takes`)
- Lọc: `Trạng thái` (**Phiếu tạm** / **Đã cân bằng kho**) · `Thời gian`
- Cột: `Mã kiểm kho` · `Thời gian` · `Ngày cân bằng` · **`Tổng chênh lệch`** ·
  **`SL lệch tăng`** · **`SL lệch giảm`** · `Ghi chú` · `Trạng thái`

⇒ Mẫu chung của chứng từ kho: **phiếu tạm → hoàn tất**, và chỉ khi hoàn tất mới sinh
`stock_moves`. Đây là bất biến cần giữ trong kios-xm.

## 3. Báo cáo — khuôn mẫu chung

Mọi báo cáo dùng **cùng một khuôn**:

```
┌ Sidebar ──────────────┬ Vùng báo cáo ─────────────────────────────────┐
│ Kiểu hiển thị         │ [↶ ↷ ⟳] [|◀ ◀ 1/1 ▶ ▶|] [📄][⤓][🖨][🔍+][🔍−][⤢]│
│   Biểu đồ / Báo cáo   │                                               │
│ Mối quan tâm          │            Ngày lập: 05/09/2026 07:41         │
│   (chỉ tiêu)          │         **Báo cáo bán hàng cuối ngày**        │
│ Thời gian             │            Ngày bán: 05/09/2026               │
│   (ngày / Từ–Tới)     │        Chi nhánh: Chi nhánh trung tâm         │
│ + bộ lọc riêng        │  ┌──────────────────────────────────────────┐ │
│                       │  │ Mã CT│Thời gian│KH│SL SP│Doanh thu│Thuế│…│ │
│                       │  └──────────────────────────────────────────┘ │
│                       │      Chi nhánh trung tâm: SH301 - …           │
└───────────────────────┴───────────────────────────────────────────────┘
```

Điểm đáng học: vùng báo cáo là **trình xem tài liệu** (có phân trang, zoom, in, xuất) —
không phải bảng HTML thường. Với kios-xm nên render báo cáo ra khổ giấy A4 + nút in/PDF.

### 3.1 Chỉ tiêu ("Mối quan tâm") theo từng báo cáo

| Báo cáo | Chỉ tiêu |
|---|---|
| **Bán hàng** | `Thời gian` · `Lợi nhuận` · `Giảm giá HĐ` |
| **Nhân viên** | `Hoa hồng` · **`Thực hiện dịch vụ`** · **`Tư vấn bán hàng`** · **`Thu ngân`** · `Thời gian` · `Lợi nhuận` |
| **Gói, thẻ đã bán** | `Bán Gói dịch vụ, liệu trình` · `Bán Thẻ tài khoản` · `Dùng Gói dịch vụ, liệu trình` · `Dùng Thẻ tài khoản` |
| **Cuối ngày** | `Bán hàng` (+ lọc: Khách hàng, Thu ngân, Tài khoản tạo, Phương thức thanh toán) |

> ⭐ **Phát hiện quan trọng**: báo cáo nhân viên phân biệt **ba** vai trò —
> `Thực hiện dịch vụ`, `Tư vấn bán hàng`, `Thu ngân`. Trước đó ở POS chỉ thấy 2
> (`Làm dịch vụ`, `Tư vấn bán`); vai trò thứ ba là **thu ngân** lấy từ người lập hoá đơn.
> ⇒ `invoice_items` cần `performer_id`, `consultant_id`; `invoices` cần `cashier_id`.
> Cả ba đều có thể là cơ sở tính hoa hồng.

### 3.2 Cột báo cáo mẫu

**Báo cáo bán hàng cuối ngày**: `Mã chứng từ` · `Thời gian` · `Khách hàng` · `SL Sản phẩm` ·
`Doanh thu` · `Thuế` · `Thu khác` · `Tổng cộng` · `Thanh toán…`

**Báo cáo bán gói dịch vụ, liệu trình**: `Gói DV, liệu trình` · `Giá bán` · `SL bán gói` ·
`SL DV trả` · `Giá trị trả` · `Doanh thu thuần`

## 4. Dashboard (Tổng quan)

Thẻ chỉ số hàng đầu: `Lịch hẹn hôm nay` (+% so với hôm qua, % hoàn thành) ·
`Khách hàng hôm nay` (Khách mới / Khách cũ quay lại / Khách lẻ) ·
`Thu chi hôm nay` (Tổng thu / Tổng chi)

Biểu đồ: `Lượng khách hàng` và `Doanh thu thuần` — đều có tab **Theo giờ / Theo ngày / Theo thứ**
và bộ chọn kỳ (Tháng này…). Doanh thu thuần hiển thị kèm `N hoá đơn` và `N trả hàng`.

`Top nhân viên xuất sắc` — tab **Doanh thu / Số lượng / Hoa hồng**
`Top 5 hàng hoá bán chạy` — tab **Dịch vụ / Gói dịch vụ, liệu trình / Thẻ tài khoản / Sản phẩm**

Cột phải: `Nhắc việc` (khách sinh nhật sắp tới, khách đang nợ) · `Lịch hẹn chưa tới` ·
`Hoạt động gần đây` (feed: "… vừa bán đơn hàng với giá trị X, thời điểm").

## 5. Màn hình thanh toán POS (theo tài liệu chính thức — **không thao tác trên dữ liệu thật**)

- Hiển thị **tiền khách trả** và **tiền thừa** tự tính.
- Phím tắt **F8** để nhập nhanh số tiền khách đưa.
- Phương thức: **tiền mặt · chuyển khoản/QR · thẻ · ví điện tử · điểm tích luỹ · voucher/coupon**
  (+ với spa: **thẻ tài khoản trả trước** của khách).
- **Thanh toán nhiều phương thức**: mở cửa sổ nhập số tiền cho từng hình thức.
- QR: tự xác nhận khi chuyển khoản thành công, có tuỳ chọn **đọc to số tiền** và
  **tự hoàn tất đơn** khi QR xác nhận.
