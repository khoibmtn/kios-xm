# Bản đồ module KiotViet Salon (nguồn tham chiếu nghiệp vụ)

> Nguồn: khảo sát trực tiếp tài khoản `salon.kiotviet.vn/mhqlv2/0946669336` (ngày 05/09/2026)
> + tài liệu chính thức kiotviet.vn. Đây là tài liệu **tham chiếu nghiệp vụ**, không phải
> spec sao chép giao diện.

## 1. Kiến trúc hệ thống gốc (quan sát được)

| Thành phần | Công nghệ / URL |
|---|---|
| Shell quản trị | Angular + micro-frontend, component đóng trong **Shadow DOM**, grid dùng **Kendo UI** |
| POS / Thu ngân | Angular (`kv-root`), lịch hẹn dùng **FullCalendar** |
| API backend | `https://api-salon.kiotviet.vn/v2/...` (REST, response bọc `{errorCode, isSuccess, result}`) |
| API legacy | `https://salon.kiotviet.vn/api/...` (response kiểu `{Total, Data[], Filter, Timestamp}`) |
| Feature flag | `feature-management-salon.kiotviet.vn` (Unleash) |
| Đường dẫn quản trị | `/mhqlv2/{retailerCode}/p/{module}` |
| Đường dẫn POS | `/{retailerCode}/posv2/#/calendar` và `#/` (bán hàng) |

**Bài học cho ta:** hai bề mặt tách biệt — *Quản trị* (desktop, bảng dày đặc) và
*Thu ngân/POS* (thao tác nhanh, cảm ứng). Ta cũng nên tách 2 bề mặt này.

## 2. Cây menu đầy đủ

```
Tổng quan          /p/dashboard
Vị trí             /p/positions              ← phòng/giường (API: /api/tables, /api/tablegroups)
Hàng hóa
├── Danh sách hàng hoá      /p/products
├── Thiết lập giá           /p/price-books
├── Hóa đơn đầu vào         /p/gdt-crawlers   ← lấy HĐĐT đầu vào từ cơ quan thuế
├── Kho hàng
│   ├── Kiểm kho            /p/stock-takes
│   ├── Xuất hủy            /p/damage-items
│   └── Xuất dùng           /p/internal-uses  ← xuất mỹ phẩm dùng nội bộ
└── Nhập hàng
    ├── Nhà cung cấp        /p/suppliers
    ├── Nhập hàng           /p/purchase-orders
    └── Trả hàng nhập       /p/purchase-returns
Đơn hàng
├── Hóa đơn                 /p/invoices
└── Trả hàng                /p/returns
Khách hàng
├── Khách hàng              /p/customers
├── Gói, thẻ đã bán         /p/customer-cards
└── CSKH & Marketing
    ├── Voucher             /p/vouchers
    ├── Khuyến mại          /p/promotions
    └── Tin nhắn Zalo/SMS/Email  /p/settings/message-templates
Nhân viên
├── Danh sách nhân viên     /p/emp-management
├── Lịch làm việc           /p/emp-calendar
├── Bảng chấm công          /p/emp-clocking
├── Bảng lương              /p/emp-paysheet
├── Bảng hoa hồng           /p/emp-commission
└── Thiết lập nhân viên     /p/emp-setting
Sổ quỹ                      /p/cashflow
Phân tích
├── Báo cáo: Cuối ngày /p/report-end-of-day · Bán hàng /p/sale-report · Tài chính /p/financial-report
│            Hàng hóa /p/product-report · Nhà cung cấp /p/supplier-report
│            Khách hàng /p/customer-report · Gói, thẻ đã bán /p/service-card-report
│            Đánh giá dịch vụ /p/rating-report · Nhân viên /p/employee-report
│            Kênh bán /p/sale-channel-report
└── Phân tích xu hướng: Khách hàng · Doanh thu · Nhân viên
Thuế & Kế toán              /p/tax-declaration + Hóa đơn điện tử
Bán online                  /p/sale-website
Thu ngân (POS)              /{retailer}/posv2/#/
```

## 3. Bốn loại "hàng hoá" — trục thiết kế quan trọng nhất

Trên POS, thanh lọc có đúng 4 tab. Đây là 4 loại bản ghi khác nhau về nghiệp vụ:

| Loại | Bản chất | Thuộc tính riêng |
|---|---|---|
| **Sản phẩm** | Hàng vật lý bán lẻ (mỹ phẩm) | tồn kho, giá vốn, đơn vị quy đổi, lô/HSD |
| **Dịch vụ** | Buổi làm dịch vụ | **`duration` (thời lượng)**, định mức nguyên vật liệu tiêu hao |
| **Gói dịch vụ / Liệu trình** | Combo N buổi bán trước, trừ dần | danh sách dịch vụ con + số buổi, hạn dùng |
| **Thẻ tài khoản** | Thẻ trả trước theo **số tiền** | mệnh giá, tiền tặng thêm, hạn dùng |

> Ví dụ thật trong tài khoản: `SP000244 – Liệu trình Meso Glutanex Glow` (Gói dịch vụ,
> 6.000.000) so với `SP000243 – Meso Glutanex Glow (Buổi)` (Dịch vụ, 2.000.000).
> Gói = nhiều buổi của cùng dịch vụ, bán kèm ưu đãi.

## 4. Tính năng đặc thù spa (khác biệt so với bán lẻ thuần)

1. **Lịch hẹn** dạng lưới tuần/ngày, kéo–thả, lọc theo KTV / phòng / trạng thái.
2. **Lịch hẹn định kỳ** (recurring) — nút ▼ cạnh "Đặt lịch".
3. **Liên kết POS ⇄ Lịch hẹn**: gán khung giờ cho một dòng dịch vụ trong hoá đơn sẽ
   **tự sinh một lịch hẹn**; xoá dòng sẽ hỏi lý do và **huỷ lịch hẹn tương ứng**.
4. **Hai vai trò hoa hồng trên mỗi dòng**: `Làm dịch vụ` (KTV thực hiện) và
   `Tư vấn bán` (nhân viên tư vấn) — tính hoa hồng khác nhau.
5. **Vị trí/phòng** gán cho từng dòng dịch vụ (tránh trùng phòng).
6. **Album ảnh trước/sau** theo khách hàng (`/customers/{id}/booking-albums`).
7. **Đánh giá dịch vụ** sau buổi làm (báo cáo `rating-report`).
8. **Định mức nguyên vật liệu**: mỗi dịch vụ có công thức tiêu hao sản phẩm
   (`productFormulaString`) → trừ kho mỹ phẩm tự động khi hoàn tất buổi.
9. **Trừ buổi tự động** từ gói/liệu trình và **trừ tiền** từ thẻ tài khoản.
10. **Multi-cart**: nhiều hoá đơn mở song song (Hoá đơn 1, 2, 3…) — phục vụ nhiều khách cùng lúc.

## 5. Ghi chú vận hành khi khảo sát

- Tài khoản khảo sát: 196 hàng hoá (199 mã), 81 khách hàng, 1 nhân viên, 1 chi nhánh
  ("Chi nhánh trung tâm"), 12 kênh bán.
- Nhóm hàng thực tế: Chăm sóc da, VTYT bơm kim, Xoá nhăn, PEEL, Hoạt chất Meso,
  Chống rụng tóc, Toner, Trị sẹo, Xịt khoáng, Body, Sữa tắm, Thẩm mỹ tạo hình…
- Dịch vụ mẫu: "Phục hồi chuyên sâu đa tầng Nano Needle sau thay da sinh học (Buổi)"
  — thời lượng 1h30', giá 500.000.
