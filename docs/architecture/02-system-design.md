# THIẾT KẾ TỔNG THỂ kios-xm
### Bản trình duyệt — phiên bản 1.0 (05/09/2026)

> Tài liệu này mô tả **hệ thống sẽ trông như thế nào và chạy ra sao**, để anh Khôi duyệt
> **trước khi** lập kế hoạch thực thi. Chưa có dòng code nào được viết.

---

## PHẦN A — QUYẾT ĐỊNH NỀN TẢNG (đã chốt)

| # | Quyết định | Hệ quả thiết kế |
|---|---|---|
| A1 | **1 spa trước, chừa đường mở rộng SaaS** | Mọi bảng nghiệp vụ **có sẵn cột `tenant_id`** nhưng UI chỉ phục vụ 1 tenant. Mở rộng sau = bật UI, không phải migrate |
| A2 | **Module Phòng khám ưu tiên sớm** | Đưa lên **M4** (thay vì M10). Hồ sơ y tế là công dân hạng nhất của khách hàng, không phải phần đính kèm |
| A3 | **Hạ tầng chốt sau** | Tầng dữ liệu viết qua **Prisma + Postgres thuần**, không dùng API độc quyền của nhà cung cấp. Xem Phần J để so sánh chi phí |
| A4 | Tailwind CSS, Vercel, desktop + mobile | Xem Phần H |

---

## PHẦN B — BẢN ĐỒ PHÂN HỆ

12 phân hệ, chia 4 tầng theo mức độ phụ thuộc:

```
┌─ TẦNG 4 · PHÂN TÍCH ────────────────────────────────────────────────┐
│  ⑪ Báo cáo & Dashboard        ⑫ Thiết lập & Quản trị hệ thống       │
└─────────────────────────────────────────────────────────────────────┘
┌─ TẦNG 3 · VẬN HÀNH HÀNG NGÀY ───────────────────────────────────────┐
│  ④ Lịch hẹn    ⑤ POS Bán hàng    ⑥ Sổ quỹ    ⑦ Kho & Mua hàng      │
└─────────────────────────────────────────────────────────────────────┘
┌─ TẦNG 2 · TÀI SẢN KHÁCH HÀNG & NHÂN SỰ ─────────────────────────────┐
│  ⑧ Gói & Thẻ trả trước   ⑨ Nhân sự (ca/công/lương/hoa hồng)         │
│  ⑩ CSKH (khuyến mại, voucher, điểm, đánh giá, nhắc lịch)            │
└─────────────────────────────────────────────────────────────────────┘
┌─ TẦNG 1 · DANH MỤC NỀN ─────────────────────────────────────────────┐
│  ① Hàng hoá (4 loại)   ② Khách hàng + Hồ sơ y tế   ③ Tài nguyên     │
│                                                    (phòng/giường)   │
└─────────────────────────────────────────────────────────────────────┘
```

### Chi tiết từng phân hệ

| # | Phân hệ | Đối tượng chính | Chức năng cốt lõi |
|---|---|---|---|
| ① | **Hàng hoá** | Sản phẩm · Dịch vụ · Gói/Liệu trình · Thẻ tài khoản | CRUD 4 loại, nhóm hàng (cây), thương hiệu, đơn vị, biến thể, bảng giá, định mức NVL cho dịch vụ, cấu hình hoa hồng theo hàng |
| ② | **Khách hàng** | Khách hàng, nhóm KH, **hồ sơ y tế** | CRUD, tra cứu nhanh theo SĐT, công nợ, lịch sử giao dịch, album trước/sau, **dị ứng & tiền sử bệnh**, phiếu khám |
| ③ | **Tài nguyên** | Phòng / giường / thiết bị | CRUD, nhóm, thứ tự hiển thị, trạng thái. Là "nguồn lực" bị chiếm dụng theo thời gian |
| ④ | **Lịch hẹn** | Booking + booking item | Lưới tuần/ngày, đặt lịch, kéo–thả, chống trùng KTV & phòng, buffer, lịch định kỳ, trạng thái, lý do huỷ, đặt lịch online |
| ⑤ | **POS Bán hàng** | Hoá đơn, dòng hàng, thanh toán | Multi-cart, chọn 4 loại hàng, gán KTV/tư vấn/phòng/giờ, giảm giá 2 cấp, thanh toán nhiều phương thức, in, trả hàng |
| ⑥ | **Sổ quỹ** | Phiếu thu/chi, quỹ | 3 loại quỹ (tiền mặt/ngân hàng/ví), danh mục thu chi, cờ tính KQKD, tồn quỹ, kết ca |
| ⑦ | **Kho & Mua hàng** | NCC, phiếu nhập, kiểm kho, xuất huỷ/dùng | Phiếu tạm → hoàn tất, thẻ kho, giá vốn bình quân, trừ NVL tự động khi làm dịch vụ |
| ⑧ | **Gói & Thẻ** | customer_packages, customer_cards | Bán, trừ buổi, trừ tiền, hạn dùng, giãn cách buổi, nhắc dùng còn dư |
| ⑨ | **Nhân sự** | Nhân viên, ca, chấm công, lương, hoa hồng | Lịch làm việc, chấm công 5 trạng thái + duyệt, bảng hoa hồng nhiều bảng × 3 vai trò, bảng lương theo kỳ |
| ⑩ | **CSKH** | Khuyến mại, voucher, điểm, đánh giá | Chương trình KM, phát hành voucher, tích/tiêu điểm, đánh giá QR, nhắc lịch Zalo/SMS |
| ⑪ | **Báo cáo** | View/materialized view | 10 báo cáo + dashboard + phân tích xu hướng |
| ⑫ | **Thiết lập** | tenant_settings, features, users, roles | Cấu hình nghiệp vụ, bật/tắt tính năng, phân quyền, khoá sổ, nhật ký thao tác |

---

## PHẦN C — KHUNG ỨNG DỤNG

### C1. Ba bề mặt

| Bề mặt | Người dùng | Thiết bị chính | Đặc điểm |
|---|---|---|---|
| **POS** `/pos` | Lễ tân, thu ngân | Tablet ngang, laptop | Nút to, ít chữ, thao tác ≤ 3 chạm, không sidebar |
| **Quản trị** `/admin` | Chủ spa, quản lý, kế toán | Desktop | Bảng dày, lọc mạnh, xuất file, báo cáo |
| **Của tôi** `/me` | KTV, nhân viên | Điện thoại | Lịch của tôi, check-in, thu nhập tạm tính |
| *(công khai)* `/booking` | Khách hàng | Điện thoại | Tự đặt lịch, không cần đăng nhập |

### C2. Điều hướng bề mặt Quản trị

```
Tổng quan
Lịch hẹn ─┬ Lịch tuần/ngày
          └ Danh sách lịch hẹn
Hàng hoá ─┬ Danh sách hàng hoá
          ├ Nhóm hàng · Thương hiệu · Đơn vị
          ├ Bảng giá
          └ Kho ─┬ Nhà cung cấp
                 ├ Nhập hàng · Trả hàng nhập
                 ├ Kiểm kho
                 └ Xuất huỷ · Xuất dùng
Bán hàng ─┬ Hoá đơn
          └ Trả hàng
Khách hàng┬ Danh sách khách hàng
          ├ Nhóm khách hàng
          ├ Gói & thẻ đã bán
          └ Hồ sơ y tế / Phiếu khám        ← module Phòng khám
Nhân viên ┬ Danh sách nhân viên
          ├ Lịch làm việc
          ├ Chấm công
          ├ Bảng hoa hồng
          └ Bảng lương
Sổ quỹ
CSKH ─────┬ Khuyến mại · Voucher
          ├ Tích điểm
          ├ Đánh giá dịch vụ
          └ Tin nhắn / Nhắc lịch
Báo cáo ──┬ Cuối ngày · Bán hàng · Tài chính
          ├ Hàng hoá · Kho · Nhà cung cấp
          ├ Khách hàng · Gói & thẻ
          └ Nhân viên · Đánh giá
Thiết lập
Vị trí/phòng
```

### C3. Mẫu màn hình dùng lại (chỉ 5 mẫu cho toàn bộ ứng dụng)

| Mẫu | Dùng ở đâu | Thành phần |
|---|---|---|
| **L1 · Danh sách** | 20+ màn hình | Sidebar lọc trái · thanh công cụ (tìm, +Thêm, Nhập/Xuất, ⚙cột) · bảng có dòng tổng ghim · phân trang · **mở rộng inline** khi bấm dòng |
| **L2 · Panel trượt phải** | Đặt lịch, sửa nhanh | Trượt từ phải, có thể nhiều bước, không rời trang |
| **L3 · Modal form** | Tạo/sửa hàng hoá, khách, NV | Tab ngang, nhóm trường thu gọn được, footer `Bỏ qua` / `Lưu` |
| **L4 · Lưới thời gian** | Lịch hẹn, lịch làm việc, chấm công | Trục ngang = ngày, trục dọc = giờ **hoặc** nhân viên/ca |
| **L5 · Trình xem báo cáo** | 10 báo cáo | Sidebar tham số (Kiểu hiển thị · Chỉ tiêu · Thời gian · lọc) · vùng A4 có phân trang, in, xuất |

> Làm tốt 5 mẫu này = làm xong 80% giao diện. Đây là điểm tiết kiệm công lớn nhất.

### C4. Bộ chọn thời gian dùng chung

```
Theo ngày │ Theo tuần  │ Theo tháng  │ Theo quý  │ Theo năm
Hôm nay   │ Tuần này   │ Tháng này   │ Quý này   │ Năm nay
Hôm qua   │ Tuần trước │ Tháng trước │ Quý trước │ Năm trước
                    Toàn thời gian  ·  Khoảng tuỳ chọn
```
Một component duy nhất, dùng ở mọi bộ lọc và mọi báo cáo.

---

## PHẦN D — VAI TRÒ & QUYỀN

| Vai trò | Thấy gì | Không được làm |
|---|---|---|
| **Chủ spa** (owner) | Tất cả | — |
| **Quản lý** (manager) | Tất cả trừ Thiết lập hệ thống & Xoá dữ liệu | Khoá sổ, xoá dữ liệu, sửa phân quyền |
| **Lễ tân / Thu ngân** (cashier) | POS, lịch hẹn, khách hàng, gói/thẻ | Xem giá vốn, lợi nhuận, lương, báo cáo tài chính |
| **Kỹ thuật viên** (technician) | `/me`: lịch của mình, khách của mình, thu nhập của mình | Xem doanh thu toàn spa, khách của người khác |
| **Kế toán** (accountant) | Sổ quỹ, hoá đơn, báo cáo, thuế | Sửa hàng hoá, đặt lịch |

**Quyền = module × hành động** (`view`/`create`/`update`/`delete`/`export`), lưu JSON.
Ngoài ra 3 cờ nhạy cảm riêng: `xem_gia_von`, `xem_luong`, `xem_bao_cao_tai_chinh`.

> ⚠️ Nhân viên (`employees`) **tách khỏi** tài khoản đăng nhập (`users`): một KTV có thể
> không có tài khoản mà vẫn được gán lịch và tính hoa hồng.

---

## PHẦN E — LUỒNG XỬ LÝ (phần quan trọng nhất để duyệt)

### E1 · Đặt lịch hẹn

```
Lễ tân bấm [+ Đặt lịch]
   │
   ├─1─ Chọn thời gian:  Hôm nay / Ngày mai / Ngày khác  +  slot 30'
   │                     (slot nhóm theo buổi: sáng/chiều/tối/đêm)
   ├─2─ Chọn khách:      gõ SĐT → hiện KH + gói còn lại + thẻ còn lại + lịch sắp tới
   │                     nếu chưa có → [+] tạo nhanh (tên + SĐT là đủ)
   ├─3─ Thêm dịch vụ:    tab [Dịch vụ] [Sản phẩm], mỗi thẻ hiện Thời lượng + Giá
   │                     nếu KH có gói chứa dịch vụ này → gợi ý "dùng buổi từ gói"
   ├─4─ Với mỗi dịch vụ: Từ giờ → Đến giờ (tự tính theo thời lượng)
   │                     + Phòng   + KTV thực hiện
   ├─5─ Ghi chú, chọn NV tư vấn
   └─6─ [Lưu]
          │
          ├─ KIỂM TRA (chặn nếu vi phạm):
          │    • KTV đã có lịch trùng giờ?          → báo lỗi, gợi ý KTV rảnh
          │    • Phòng đã bị chiếm giờ đó?          → báo lỗi, gợi ý phòng trống
          │    • KTV có trong ca làm việc?          → chỉ chặn nếu bật "Giới hạn theo ca"
          │    • Cách buổi trước đủ số ngày?        → cảnh báo nếu gói có giãn cách
          │    • Buffer giữa 2 dịch vụ ≥ cấu hình?  → tự chèn
          └─ Tạo booking (trạng thái: Chưa tới) + hẹn gửi nhắc lịch
```

**Trạng thái lịch hẹn**: `Chưa tới` → `Đã tới` → `Đang làm` → `Hoàn tất`
với 2 nhánh: `Huỷ` (kèm lý do bắt buộc) · `Không đến`.

### E2 · Khách đến — check-in → làm dịch vụ → thanh toán

```
Khách đến
   │
   ├─ Lễ tân mở lịch, bấm lịch hẹn → [Đã tới]
   ├─ Bấm [Chuyển sang hoá đơn]  → mở POS với giỏ đã điền sẵn từ lịch hẹn
   │
   ├─ POS: kiểm tra lại dòng hàng
   │     • dịch vụ nào trừ từ gói  → hiện "Dùng buổi 3/10", đơn giá = 0
   │     • dịch vụ bán mới          → nhập giá, giảm giá (% hoặc tiền)
   │     • gán KTV thực hiện + NV tư vấn cho từng dòng
   │     • thêm sản phẩm bán kèm (mỹ phẩm mang về)
   │
   ├─ [Thanh toán] → màn hình thanh toán
   │     • tiền khách đưa (F8) → tự tính tiền thừa
   │     • nhiều phương thức: tiền mặt · CK/QR · thẻ · ví · **thẻ tài khoản** · điểm · voucher
   │     • nếu dùng thẻ tài khoản: kiểm tra phạm vi tiêu + số dư
   │     • nếu thiếu tiền → ghi nợ khách hàng
   │
   └─ [Hoàn tất]  ─── một giao dịch nguyên tử ───────────────────────┐
        1. Hoá đơn → `completed`, sinh mã HD######                   │
        2. Booking item → `Hoàn tất`                                 │
        3. Trừ buổi gói / trừ tiền thẻ (ghi nhật ký)                 │
        4. Trừ kho: sản phẩm bán + **NVL tiêu hao theo định mức**    │
        5. Ghi hoa hồng cho 3 vai trò (thực hiện / tư vấn / thu ngân)│
        6. Sinh phiếu thu sổ quỹ mã TTHD######                       │
        7. Cộng điểm tích luỹ                                        │
        8. Sinh QR đánh giá in trên hoá đơn                          │
        ──────────────────────────────────────────────────────────────┘
             Nếu bất kỳ bước nào lỗi → rollback toàn bộ
```

### E3 · Bán gói liệu trình rồi dùng dần

```
Ngày 1  │ Bán gói "Liệu trình Meso 10 buổi" — 6.000.000
        │   → tạo customer_packages (10 buổi, HSD 12 tháng, giãn cách 14 ngày)
        │   → hoá đơn 6.000.000, hoa hồng tư vấn cho người bán
        │
Ngày 15 │ Khách đến làm buổi 1
        │   → đặt lịch, chọn "dùng buổi từ gói"
        │   → hoá đơn giá trị 0đ (hợp lệ!)
        │   → trừ 1 buổi (còn 9), ghi nhật ký gắn booking
        │   → hoa hồng THỰC HIỆN cho KTV (tính trên giá trị buổi, không phải 0đ)
        │   → trừ NVL meso khỏi kho
        │
Ngày 20 │ Khách muốn làm buổi 2 → hệ thống cảnh báo "chưa đủ 14 ngày giãn cách"
        │   → quản lý có quyền bỏ qua cảnh báo
        │
Tháng 13│ Gói hết hạn còn 3 buổi → trạng thái `expired`
        │   → hiện ở Nhắc việc trước 30 ngày để CSKH gọi khách
```

> **Điểm mấu chốt cần duyệt**: hoa hồng KTV khi dùng buổi từ gói tính trên
> **giá trị phân bổ của buổi** (= giá gói ÷ tổng số buổi), không phải 0đ.
> Nếu không, KTV làm buổi trong gói sẽ không có thu nhập.

### E4 · Phòng khám (module ưu tiên sớm)

```
Khách hàng
  └─ Hồ sơ y tế (1 bản, cập nhật dần)
       • Dị ứng (mỹ phẩm, thuốc tê, latex…)
       • Tiền sử bệnh (tim mạch, tiểu đường, thai kỳ, sẹo lồi…)
       • Loại da, tình trạng da hiện tại
       • Chống chỉ định đã ghi nhận
       └─ ⚠️ HIỂN THỊ CẢNH BÁO ĐỎ ngay khi chọn khách ở POS & lịch hẹn

  └─ Phiếu khám (n bản, mỗi lần khám 1 phiếu)
       • Ngày khám · Bác sĩ/KTV phụ trách
       • Lý do khám · Triệu chứng
       • Chẩn đoán · Hướng điều trị
       • Dịch vụ chỉ định  → tạo được lịch hẹn/hoá đơn từ đây
       • Ảnh trước / sau   → album gắn với buổi
       • Dặn dò chăm sóc tại nhà → gửi Zalo cho khách
```

### E5 · Nhập hàng → tồn kho → giá vốn

```
Tạo phiếu nhập (Phiếu tạm)  →  sửa thoải mái, KHÔNG ảnh hưởng tồn
      │
      └─ [Hoàn tất nhập hàng]
             • tồn kho +N
             • ghi stock_moves
             • tính lại giá vốn bình quân
             • công nợ NCC +tiền
             • (tuỳ chọn) sinh phiếu chi sổ quỹ
```
Áp dụng y hệt cho: Trả hàng nhập · Kiểm kho (cân bằng) · Xuất huỷ · Xuất dùng.

### E6 · Chốt lương cuối tháng

```
[+ Bảng tính lương] → chọn kỳ (01/09–30/09) và nhóm nhân viên
   │
   ├─ Hệ thống gom tự động:
   │    • Lương cơ bản  ← loại lương (ca / giờ / ngày công / cố định) × chấm công đã duyệt
   │    • Hoa hồng      ← Σ commission_entries trong kỳ (3 vai trò)
   │    • Thưởng        ← theo doanh thu
   │    • Phụ cấp       ← ăn trưa, đi lại…
   │    • Giảm trừ      ← đi muộn, về sớm, vi phạm
   │    • Tạm ứng       ← đã ứng trong kỳ
   │
   ├─ Trạng thái: Đang tạo → Tạm tính → [Chốt lương]
   └─ Khi chốt: khoá commission_entries (locked=true), không tính lại được
```

### E7 · Khách tự đặt lịch online

```
Khách quét QR / mở link  →  /booking/{slug}
   1. Chọn dịch vụ (hiện giá + thời lượng)
   2. Chọn ngày → hệ thống chỉ hiện slot CÒN TRỐNG
      (đã trừ: lịch đã đặt, ngoài giờ mở cửa, KTV nghỉ, phòng bận)
   3. (tuỳ chọn) chọn KTV quen
   4. Nhập tên + SĐT → OTP xác thực
   5. Xác nhận → booking trạng thái `Chờ xác nhận`
        → hiện ngay trên lịch của lễ tân (thông báo realtime)
        → lễ tân xác nhận → gửi Zalo/SMS cho khách
```

---

## PHẦN F — MÔ HÌNH DỮ LIỆU (sơ đồ quan hệ rút gọn)

```
tenants ─< branches ─< users ─< roles
                          │
products ──┬── product_variants                    customers ──┬── customer_groups
  (4 kinds)├── package_items ──> products(service)      │      ├── medical_profiles  ⭐
           ├── service_materials ──> products(product)  │      ├── clinical_visits   ⭐
           ├── card_scopes                              │      ├── customer_albums
           └── commission_rules                         │      ├── customer_packages ──< package_usages
                                                        │      ├── customer_cards ──< card_transactions
resources (phòng/giường)                                │      └── debts
     │
     └──< booking_items >── bookings >── customers
                │                │
                │                └──> invoices
                │
                └──> users (performer)     invoices ──┬──< invoice_items
                └──> users (consultant)               ├──< payments ──> cash_transactions
                                                      └──> price_books

products ──< inventory (theo branch)
         └──< stock_moves <── purchase_orders / stock_takes / damages / internal_uses / invoices

employees ──┬── employee_schedules ──> shifts
            ├── attendances
            ├── employee_salaries ──> salary_templates
            ├── commission_table_employees ──> commission_tables ──< commission_rules
            └── commission_entries ──> invoice_items
                     │
                     └──> payroll_lines ──> payrolls
```

**Bảng ước tính**: ~55 bảng. Trong đó 12 bảng là lõi (products, customers, bookings,
booking_items, invoices, invoice_items, payments, stock_moves, customer_packages,
customer_cards, commission_entries, cash_transactions).

---

## PHẦN G — 12 QUY TẮC BẤT BIẾN (hệ thống phải luôn đúng)

| # | Quy tắc | Cưỡng chế ở đâu |
|---|---|---|
| G1 | Một KTV không thể có 2 lịch chồng giờ | Postgres `EXCLUDE USING gist` |
| G2 | Một phòng không thể bị 2 lịch chiếm cùng lúc | Postgres `EXCLUDE USING gist` |
| G3 | Số buổi đã dùng ≤ tổng buổi + buổi tặng | CHECK + transaction |
| G4 | Số dư thẻ tài khoản ≥ 0 | CHECK + transaction |
| G5 | Thẻ chỉ tiêu được trong phạm vi đã cấu hình | Service `cardService.canSpend()` |
| G6 | Hoá đơn `completed` là bất biến — sửa phải qua phiếu trả/điều chỉnh | Service + trigger |
| G7 | Mỗi lần thanh toán sinh đúng 1 phiếu thu sổ quỹ | Transaction |
| G8 | `invoices.paid_amount` = Σ `payments.amount` | Trigger |
| G9 | Tồn kho chỉ thay đổi qua `stock_moves` | Không cho UPDATE trực tiếp `inventory` |
| G10 | Chứng từ kho chỉ ghi `stock_moves` khi chuyển sang trạng thái hoàn tất | Service |
| G11 | Sau khi chốt lương, `commission_entries` bị khoá | Cột `locked` + CHECK |
| G12 | Sau ngày khoá sổ, không sửa/xoá giao dịch trước ngày đó | Trigger toàn cục |

---

## PHẦN H — THIẾT KẾ GIAO DIỆN

### H1. Nguyên tắc
- **Tiếng Việt có dấu**, font **Be Vietnam Pro** (hiển thị dấu tốt hơn Inter).
- Số tiền: `1.500.000` (dấu chấm), không hiện `₫` trong bảng, chỉ hiện ở tổng.
- Màu ngữ nghĩa cố định: doanh thu/hoàn tất = xanh lá · nợ/huỷ = đỏ · chờ = cam ·
  gói/liệu trình = tím · thẻ tài khoản = xanh dương.
- Mọi hành động phá huỷ đều có xác nhận + (nếu ảnh hưởng lịch/tiền) **bắt nhập lý do**.

### H2. Điểm ngắt responsive

| Kích thước | POS | Quản trị |
|---|---|---|
| < 640px (điện thoại) | Giỏ hàng và danh sách hàng là **2 tab** chuyển qua lại | Bảng → **danh sách thẻ**, lọc trong drawer |
| 640–1024px (tablet dọc) | 2 cột hẹp, nút ≥ 44px | Sidebar thu gọn thành icon |
| > 1024px (tablet ngang, desktop) | 2 cột đầy đủ | Bố cục đầy đủ |

Lịch hẹn trên điện thoại: chuyển từ lưới tuần → **lưới 1 ngày**, cuộn dọc theo giờ.

### H3. Ba màn hình `/me` cho KTV (điện thoại)
1. **Lịch của tôi hôm nay** — danh sách buổi, nút `Bắt đầu` / `Hoàn tất`
2. **Thu nhập tạm tính** — lương + hoa hồng đến thời điểm hiện tại trong kỳ
3. **Khách của tôi** — lịch sử buổi đã làm, ảnh trước/sau

---

## PHẦN I — YÊU CẦU PHI CHỨC NĂNG

| Hạng mục | Mục tiêu |
|---|---|
| Tốc độ POS | Thêm hàng vào giỏ < 100ms; hoàn tất hoá đơn < 1.5s |
| Đồng thời | 5–10 người dùng cùng lúc / chi nhánh |
| Realtime | Lịch hẹn cập nhật giữa các máy < 3s |
| Sao lưu | Tự động hàng ngày, giữ 30 ngày, khôi phục theo thời điểm |
| Nhật ký | Ghi mọi thao tác tạo/sửa/xoá trên dữ liệu tiền & lịch |
| Bảo mật | Mật khẩu băm, phiên hết hạn, phân quyền theo chi nhánh, che giá vốn/lương theo vai trò |
| Dữ liệu y tế | Hồ sơ y tế chỉ người có quyền mới xem; ghi log mỗi lần truy cập |

---

## PHẦN J — CHI PHÍ HẠ TẦNG (để anh quyết A3)

Ước tính theo **3 mốc quy mô**. Giá tham khảo, cần kiểm tra lại tại thời điểm triển khai.

| Quy mô | Dữ liệu ước tính | Supabase | Neon + Vercel Blob |
|---|---|---|---|
| **1 spa** (hiện tại) — 500 HĐ/tháng, 200 hàng hoá, ~2GB ảnh | < 1GB DB | Gói Pro ~25$/tháng (đã gồm auth, storage, realtime) | Neon ~19$ + Blob ~5$ ≈ 24$ |
| **10 spa** — 5.000 HĐ/tháng, 20GB ảnh | ~5GB DB | ~25$ + phụ trội storage | ~40–60$ |
| **100 spa** — 50.000 HĐ/tháng, 200GB ảnh | ~50GB DB | ~$hàng trăm, cần Team plan | Tách storage sang S3/R2 rẻ hơn nhiều |

**Khuyến nghị**: bắt đầu bằng **Supabase** (đỡ phải tự dựng auth/storage/realtime — tiết kiệm
khoảng 2 milestone công sức). Vì tầng dữ liệu viết bằng **Prisma + SQL thuần**, nếu sau này
chi phí tăng thì **chuyển sang Neon/RDS chỉ cần đổi chuỗi kết nối**; phần đắt khi scale là
**ảnh**, và ảnh nên tách sang **Cloudflare R2** (không tính phí egress) ngay từ mốc 10 spa.

> 🔒 Cam kết thiết kế: **không dùng tính năng độc quyền** của bất kỳ nhà cung cấp nào
> (không Supabase RLS làm lõi phân quyền, không Edge Functions riêng). Phân quyền nằm ở
> tầng service của ứng dụng ⇒ luôn có đường thoát.

---

## PHẦN K — LỘ TRÌNH ĐỀ XUẤT (đã cập nhật theo quyết định A2)

| M | Tên | Nội dung chính | Vì sao thứ tự này |
|---|---|---|---|
| **M0** | Nền móng | Next.js + Tailwind + Prisma + Auth + phân quyền + 5 mẫu màn hình | Làm 5 mẫu trước = tăng tốc mọi milestone sau |
| **M1** | Danh mục | Hàng hoá 4 loại, nhóm/thương hiệu/đơn vị, phòng, nhân viên, khách hàng | Không có dữ liệu nền thì không làm được gì |
| **M2** | Lịch hẹn | Lưới, đặt lịch, chống trùng, ca làm việc | Trái tim của spa |
| **M3** | POS | Multi-cart, bán hàng, thanh toán, in, sổ quỹ cơ bản | Bắt đầu tạo ra tiền |
| **M4** | **Phòng khám + Gói/Thẻ** | Hồ sơ y tế, phiếu khám, album trước/sau · bán & trừ gói/thẻ | ⭐ Ưu tiên sớm theo yêu cầu; gắn chặt với luồng khám–điều trị |
| **M5** | Kho | NCC, nhập hàng, kiểm kho, định mức NVL, giá vốn | Sau khi có bán hàng mới cần trừ kho chính xác |
| **M6** | Nhân sự & lương | Ca, chấm công, hoa hồng 3 vai trò, bảng lương | Cần dữ liệu bán hàng tích luỹ mới tính được |
| **M7** | Báo cáo | 10 báo cáo + dashboard | Cần đủ dữ liệu từ M1–M6 |
| **M8** | CSKH | Khuyến mại, voucher, điểm, đánh giá, nhắc lịch Zalo | Tăng trưởng, không phải vận hành lõi |
| **M9** | Đặt lịch online + `/me` | Trang public + PWA cho KTV | Mở rộng ra ngoài |

---

## CẦN ANH DUYỆT

1. **Bản đồ 12 phân hệ** (Phần B) — thiếu/thừa gì không?
2. **Luồng E2 (bán hàng) và E3 (gói liệu trình)** — có khớp cách spa anh đang vận hành không?
3. **Quy tắc hoa hồng khi dùng buổi từ gói** (E3, ô ghi chú) — tính theo giá trị phân bổ,
   anh đồng ý không?
4. **Phân quyền Phần D** — KTV có được xem doanh thu toàn spa không? Lễ tân có được xem
   giá vốn không?
5. **Lộ trình Phần K** — thứ tự M4 (Phòng khám + Gói/Thẻ) đã đúng ưu tiên chưa?
6. **Chi phí Phần J** — chọn Supabase hay để trung lập tiếp?
