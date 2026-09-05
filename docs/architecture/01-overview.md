# Kiến trúc kios-xm

## 1. Nguyên tắc

1. **Hai bề mặt, một backend.** POS (thao tác nhanh) và Quản trị (bảng + báo cáo) tách route
   group riêng, dùng chung service layer.
2. **Multi-tenant từ ngày đầu.** Mọi truy vấn đi qua `tenantId` + `branchId`. Rẻ hơn nhiều so
   với nhồi vào sau.
3. **Feature flag theo tenant.** KiotViet bật/tắt Khuyến mại, Voucher, Phòng khám, Tích điểm…
   Ta làm tương tự bằng bảng `tenant_features`.
4. **Nghiệp vụ nằm ở service, không ở component.** Trừ buổi gói, trừ tiền thẻ, tính hoa hồng,
   trừ kho theo định mức — đều là hàm thuần trong `server/services/`, có test.
5. **Mobile không phải bản rút gọn.** Lễ tân dùng điện thoại để xem lịch và check-in.

## 2. Cấu trúc thư mục

```
app/
├─ (auth)/login/
├─ (pos)/                        # bề mặt Thu ngân — layout riêng, không sidebar
│  ├─ calendar/                  # lịch hẹn (FullCalendar)
│  └─ sale/                      # bán hàng, multi-cart
├─ (admin)/                      # bề mặt Quản trị — sidebar + topbar
│  ├─ dashboard/
│  ├─ products/  price-books/  inventory/{stock-takes,damages,internal-uses}/
│  ├─ purchases/{orders,returns}/  suppliers/
│  ├─ invoices/  returns/
│  ├─ customers/  customer-cards/  vouchers/  promotions/
│  ├─ employees/{list,schedule,attendance,payroll,commission,settings}/
│  ├─ cashflow/
│  ├─ reports/{end-of-day,sales,finance,products,customers,packages,employees,ratings}/
│  ├─ clinic/                    # module Phòng khám (bật/tắt)
│  └─ settings/
├─ (booking)/[tenantSlug]/       # trang đặt lịch online công khai cho khách
└─ api/

components/
├─ ui/                # shadcn/ui
├─ data-table/        # DataTable dùng chung: sidebar lọc + bảng + dòng tổng + phân trang
├─ pos/               # CartTabs, ProductPicker, LineItem, PaymentSheet
├─ calendar/          # BookingCalendar, BookingPanel, TimeSlotPicker
└─ shared/

server/
├─ services/          # nghiệp vụ thuần: booking, invoice, package, card, commission, stock
├─ actions/           # server actions gọi service
└─ db.ts

lib/  prisma/  docs/
```

## 3. Ranh giới service (quan trọng nhất)

| Service | Trách nhiệm | Bất biến phải giữ |
|---|---|---|
| `bookingService` | tạo/dời/huỷ lịch, kiểm tra trùng | Không trùng `resource_id` và `performer_id` theo thời gian; tôn trọng buffer 5' và ca làm việc |
| `invoiceService` | tạo hoá đơn, thanh toán, huỷ | Hoá đơn `completed` bất biến; huỷ phải sinh bút toán ngược |
| `packageService` | bán gói, trừ buổi, hoàn buổi | `used ≤ total + bonus`; trừ buổi phải gắn `booking_id` |
| `cardService` | bán thẻ, nạp, trừ tiền | `balance ≥ 0`; mọi biến động ghi `card_transactions` |
| `commissionService` | tính hoa hồng khi hoá đơn hoàn tất | Tính riêng `performer` và `consultant`; khoá sổ thì không tính lại |
| `stockService` | trừ kho khi bán + trừ NVL theo định mức dịch vụ | Mọi biến động qua `stock_moves`; `on_hand` là tổng hợp |
| `cashService` | phiếu thu/chi, tồn quỹ | Tồn quỹ = đầu kỳ + thu − chi |

### 3.1 Luồng "hoàn tất một buổi dịch vụ" (giao dịch nguyên tử)

```
completeServiceLine(invoiceItem):
  1. booking_item.status = 'done'
  2. nếu dùng gói  → packageService.consume(packageItemId, 1, bookingId)
     ngược lại     → tính doanh thu dòng
  3. stockService.consumeMaterials(serviceId, qty)      # trừ mỹ phẩm theo định mức
  4. commissionService.accrue(invoiceItem)              # 2 vai trò
  5. nếu trả bằng thẻ → cardService.spend(cardId, amount)
  → tất cả trong MỘT transaction
```

## 4. Quyết định kỹ thuật

| Vấn đề | Quyết định | Lý do |
|---|---|---|
| Chống trùng lịch | Postgres `EXCLUDE USING gist` trên `tstzrange` | DB cưỡng chế, không phụ thuộc app logic |
| Tiền tệ | `numeric(18,2)`, không float | Tránh sai số |
| Thời gian | lưu `timestamptz` UTC | Nhiều chi nhánh, tránh lệch giờ |
| Mã chứng từ | sequence theo tenant + prefix (`HD`, `PT`, `PC`, `LH`) | Giống thói quen người dùng VN |
| Realtime lịch hẹn | Postgres LISTEN/NOTIFY → SSE (giai đoạn sau) | Nhiều máy cùng xem lịch |
| Ảnh | Vercel Blob hoặc S3 | Album trước/sau nhiều ảnh |
| Báo cáo | SQL view + materialized view cho báo cáo nặng | Không kéo hết về app |

## 5. Phân quyền

Vai trò gợi ý: `owner` · `manager` · `cashier` · `technician` · `accountant`.
Quyền theo **module × hành động** (`view`, `create`, `update`, `delete`, `export`)
lưu `roles.permissions jsonb`. Nhân viên (`employees`) tách khỏi tài khoản đăng nhập
(`users`) — một KTV có thể không có tài khoản.

## 6. Lộ trình (milestone)

| M | Tên | Nội dung | Kết quả nghiệm thu |
|---|---|---|---|
| **M0** | Nền móng | Next.js + Tailwind + Prisma + Auth + multi-tenant + deploy Vercel | Đăng nhập được, có 1 tenant mẫu trên Vercel |
| **M1** | Danh mục | Hàng hoá 4 loại, nhóm hàng, thương hiệu, đơn vị, vị trí/phòng, nhân viên | Nhập được 196 hàng hoá mẫu, tạo phòng & KTV |
| **M2** | Lịch hẹn | Lưới tuần/ngày, đặt lịch 2 bước, kéo–thả, chống trùng, buffer, trạng thái | Đặt/dời/huỷ lịch không trùng phòng & KTV |
| **M3** | POS | Multi-cart, chọn 4 loại hàng, gán KTV/tư vấn/phòng/giờ, thanh toán nhiều phương thức | Bán 1 dịch vụ + 1 sản phẩm, in hoá đơn |
| **M4** | Gói & thẻ | Bán gói/liệu trình, trừ buổi, thẻ trả trước, trừ tiền, hạn dùng | Bán gói 10 buổi → dùng 1 buổi → còn 9 |
| **M5** | Kho | Nhập hàng, NCC, kiểm kho, xuất huỷ/dùng, định mức NVL, thẻ kho | Bán dịch vụ tự trừ mỹ phẩm theo định mức |
| **M6** | Nhân viên & lương | Ca làm việc, chấm công, bảng hoa hồng, bảng lương | Tính đúng hoa hồng 2 vai trò cho 1 kỳ |
| **M7** | Sổ quỹ & báo cáo | Phiếu thu/chi, 10 báo cáo, dashboard | Báo cáo cuối ngày khớp sổ quỹ |
| **M8** | CSKH | Khuyến mại, voucher, tích điểm, đánh giá, nhắc lịch Zalo/SMS | Gửi nhắc lịch + thu đánh giá qua QR |
| **M9** | Đặt lịch online | Trang public theo tenant + QR | Khách đặt lịch từ điện thoại |
| **M10** | Phòng khám | Phiếu khám, thông tin y tế, album trước/sau | Bật/tắt module không mất dữ liệu |
