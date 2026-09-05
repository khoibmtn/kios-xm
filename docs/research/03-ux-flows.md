# Luồng nghiệp vụ & UX (quan sát trực tiếp)

## 1. Màn hình Thu ngân — tab "Lịch hẹn"

**Bố cục** (desktop):

```
┌ Header: [Lịch hẹn] [Bán hàng] ................ [🔍 Tìm hồ sơ khách hàng] [avatar] [☰]
├ Toolbar: [Lưới|Danh sách]  [🔍 mã/tên/SĐT khách]  [Tất cả trạng thái ▾]  [⚙lọc]
│          [◀] [31/08 - 06/09] [▶]  [Tuần ▾]  [+ Đặt lịch ▾]
├ Lưới FullCalendar: cột = ngày trong tuần, hàng = giờ (00:00–23:00), đường kẻ 30'
└ Footer: "Tổng số N lịch hẹn"
```

- **Chế độ xem**: Lưới / Danh sách; phạm vi: Ngày / Tuần (dropdown).
- **Bộ lọc nâng cao**: theo *resource* (KTV, phòng) — có nút "Bỏ lọc" / "Xem kết quả".
- **▼ cạnh nút Đặt lịch**: tạo **lịch hẹn định kỳ**.
- **Tìm hồ sơ khách hàng** (ô riêng ở header): tra nhanh gói dịch vụ, thẻ tài khoản,
  lịch hẹn sắp tới của một khách — rất tiện ở quầy lễ tân.

### Luồng tạo lịch hẹn (2 bước, panel trượt phải)

**Bước 1 — Chọn thời gian**
- Chip nhanh: `Hôm nay` · `Ngày mai` · `Ngày khác 📅`
- Slot 30 phút, **nhóm theo buổi có icon**: 🌅 08:00–14:00 · 🌤 14:00–19:00 ·
  ☀️ 19:00–24:00 · 🌙 00:00–08:00
- Nút `Tiếp tục` bị vô hiệu cho tới khi chọn slot.

**Bước 2 — Chi tiết lịch hẹn**
```
Lịch hẹn                                    [Chưa tới ▾] [✕]
17:30, Thứ Bảy 05/09  ✏️
[🔍 Tìm theo mã, tên, SĐT khách hàng] [+]      ← + = tạo KH mới ngay
┌──────────────────────────────────┐
│  (trống) Chưa có dịch vụ, sản phẩm│
│      [ Thêm dịch vụ, sản phẩm ]   │
└──────────────────────────────────┘
🏷 Ghi chú lịch hẹn ✏️              [👤 nhân viên ▾]
[            Lưu thay đổi            ]
```

**Bảng chọn dịch vụ** (khi bấm "Thêm dịch vụ, sản phẩm"):
- Tabs: `Dịch vụ` | `Sản phẩm`
- Nhóm theo danh mục, mỗi dòng: ảnh · tên · **Thời lượng: 1h30'** · **Giá: 500,000**
- Có ô tìm kiếm + nút lọc.

## 2. Màn hình Thu ngân — tab "Bán hàng" (POS)

```
┌ [Lịch hẹn] [Hóa đơn 1 ✕] [+] ......... [🔍 Tìm hồ sơ khách hàng] [avatar] [☰]
├────────────────┬──────────────────────────────────────────────────────┐
│ [🔍 tìm hàng][+]│ [🔍 Tìm theo mã, tên, SĐT khách hàng]           [+]  │
│ [⚙][Dịch vụ]   │ ┌──────────────────────────────────────────────────┐ │
│ [Gói dịch vụ]  │ │1  Tên dịch vụ           (−) 1 (+)  500,000  500,000│
│ [Thẻ tài khoản]│ │   Làm dịch vụ: [07:11-08:41 (1h30')] Chọn nhân viên│
│ [Sản phẩm]     │ │   Tư vấn bán:  Chọn nhân viên          [🗑] [⋮]    │
│                │ └──────────────────────────────────────────────────┘ │
│ ── Chăm sóc da │                                                      │
│ [ảnh] Tên      │                                                      │
│  Thời lượng    │                                                      │
│         500,000│                                                      │
├────────────────┼──────────────────────────────────────────────────────┤
│                │ [☰][👤▾]                        [ Thanh toán 500,000 ]│
└────────────────┴──────────────────────────────────────────────────────┘
```

**Điểm thiết kế đáng học:**

1. **Multi-cart**: tab `Hoá đơn 1`, `+` mở hoá đơn mới → phục vụ nhiều khách song song.
2. **Danh sách hàng bên trái luôn hiện thời lượng + giá** — nhân viên chọn nhanh không cần mở chi tiết.
3. **Mỗi dòng hàng có 2 ô gán nhân viên**: `Làm dịch vụ` và `Tư vấn bán`.
4. Menu `⋮` trên dòng: **Ghi chú** · **Thêm dòng** (tách dòng để 2 KTV cùng làm 1 dịch vụ).
5. Popup gán thực hiện (bấm vào "Chọn nhân viên" ở *Làm dịch vụ*):
   ```
   Từ giờ [07:11 🕐] → Đến giờ [08:41 🕐]  1h30'   ← tự tính theo duration
   Vị trí        [Chọn vị trí ▾]                    ← phòng/giường
   Nhân viên làm dịch vụ [Chọn nhân viên]
   ```

### ⚠️ Quy tắc liên kết POS ⇄ Lịch hẹn (đã kiểm chứng bằng thực nghiệm)

- Khi gán khung giờ cho một dòng dịch vụ → hệ thống **tạo ngay một lịch hẹn**
  (toast: *"Tạo lịch hẹn thành công"*), kể cả khi hoá đơn chưa thanh toán.
- Khi xoá dòng đó → hiện dialog **"Huỷ dịch vụ"**: *"Dịch vụ này đã ghi nhận thời gian
  sử dụng cho khách hàng, bạn có chắc chắn muốn huỷ lịch và xoá sản phẩm khỏi đơn?"*
  kèm **dropdown lý do** + ô nhập lý do → xác nhận mới huỷ cả lịch hẹn.
- ⇒ Trong kios-xm: `invoice_items` và `booking_items` phải là **cùng một thực thể lịch**
  hoặc liên kết 1-1 có ràng buộc, không phải hai bản ghi rời rạc.

## 3. Quản trị — Hàng hoá

```
Hàng hoá                [🔍 Tìm theo mã, tên hàng]   [+ Hàng hóa ▾] [Nhập file] [Xuất file] [⚙cột]
┌ Sidebar lọc ─────┬ Bảng ────────────────────────────────────────────────┐
│ Loại hàng        │ ☐ ⭐ Mã hàng | Tên hàng | Loại hàng | Giá bán | Giá vốn│
│ Nhóm hàng [+Tạo] │              |          | (badge)   |         | | Tồn kho│
│ Tồn kho          │ ─ dòng tổng: 3,542.5 ...                             │
│ Thương hiệu      │ SP000244 Liệu trình...  [Gói dịch vụ, liệu trình]     │
│ Thuộc tính       │ SP000243 Meso...        [Dịch vụ]                     │
│  DUNG TÍCH/DA/HSD│ SP000242 Body Scrub     [Sản phẩm]                    │
│ Vị trí           │ ...                                                   │
│ Trạng thái       │ Hiển thị [10 ▾] |◀ ◀ 1 ▶ ▶| 1-10 trên 196 hàng hoá   │
└──────────────────┴───────────────────────────────────────────────────────┘
```

- Badge màu phân biệt loại: `Sản phẩm` (xanh lá) · `Dịch vụ` (xám) · `Gói dịch vụ, liệu trình` (hồng).
- Click dòng → **mở rộng inline** (không chuyển trang) hiện chi tiết + tab con.
- Có **dòng tổng** ghim trên đầu bảng.
- Cột tuỳ chỉnh qua nút ⚙ bên phải.

## 4. Quản trị — Khách hàng

Bảng: `Mã KH | Tên KH | Ngày giao dịch cuối | Nợ | Tổng bán | Tổng bán trừ trả hàng`.
Click dòng → mở chi tiết với các tab tương ứng các endpoint ở `02-data-model.md` §A2:
Thông tin · Gói dịch vụ · Thẻ tài khoản · Lịch sử giao dịch · Album ảnh · Công nợ.

## 5. Quản trị — Nhân viên

Bảng: `Mã NV | Mã chấm công | Tên NV | SĐT | Số CMND/CCCD | Nợ và tạm ứng | Ghi chú`.
Sidebar lọc: Trạng thái (Đang làm việc / Đã nghỉ) · Phòng ban · Chức danh (đều có "Tạo mới").
Nút: `+ Nhân viên` · `Duyệt yêu cầu` (duyệt đơn xin nghỉ/đổi ca) · `⋯` · `⚙cột`.

**Tab chi tiết nhân viên**: `Thông tin` · `Lịch làm việc` · `Thiết lập lương` ·
`Phiếu lương` · `Nợ và tạm ứng`. Footer: `Ngừng làm việc` | `Cập nhật` | `Lấy mã xác nhận`.

Trường thông tin: SĐT · Chi nhánh trả lương · Chi nhánh làm việc · Phòng ban · Chức danh ·
Tài khoản đăng nhập · CMND/CCCD · Ngày sinh · Giới tính · Địa chỉ · Email · Facebook ·
Ngày bắt đầu làm việc · Mã chấm công · Thiết bị di động · Thông tin ngân hàng · Ghi chú.

## 6. Quản trị — Vị trí/phòng

Bảng đơn giản: `Tên vị trí/phòng | Ghi chú | Nhóm | Trạng thái | Số thứ tự`,
sidebar lọc Nhóm + Trạng thái, có Nhập/Xuất file.

## 7. Nguyên tắc UX rút ra để áp dụng cho kios-xm

| # | Nguyên tắc | Lý do |
|---|---|---|
| 1 | Tách 2 bề mặt: **POS** (thao tác nhanh, nút to) và **Quản trị** (bảng dày, lọc mạnh) | Người dùng và ngữ cảnh khác nhau |
| 2 | POS phải chạy tốt trên **tablet ngang** và **điện thoại**; Quản trị ưu tiên desktop nhưng vẫn dùng được trên mobile | Lễ tân dùng tablet, chủ spa xem báo cáo trên điện thoại |
| 3 | Bảng danh sách = sidebar lọc trái + bảng phải + dòng tổng + phân trang + tuỳ chỉnh cột | Mẫu lặp lại ở mọi module → làm 1 component dùng chung |
| 4 | Chi tiết mở **inline/expand** hoặc **panel trượt phải**, hạn chế chuyển trang | Giữ ngữ cảnh danh sách |
| 5 | Chọn thời gian bằng **chip slot 30'** nhóm theo buổi, không dùng time-picker thô | Nhanh hơn nhiều khi đặt lịch qua điện thoại |
| 6 | Mọi thao tác huỷ/xoá có ảnh hưởng lịch hẹn đều phải **hỏi lý do** | Phục vụ báo cáo tỉ lệ huỷ |
| 7 | Hiển thị **thời lượng** ngay trên thẻ dịch vụ | Quyết định xếp lịch |
