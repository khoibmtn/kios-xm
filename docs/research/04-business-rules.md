# Quy tắc nghiệp vụ & tuỳ chọn cấu hình (trích từ trang Thiết lập)

Trang `/p/settings` của KiotViet Salon cho thấy toàn bộ các "nút vặn" nghiệp vụ mà
một phần mềm spa cần có. Đây là danh sách để kios-xm đối chiếu.

## 1. Cấu trúc trang Thiết lập

```
Quản lý:  Hàng hóa · Đơn hàng · Khách hàng · Báo cáo · Thuế & Kế toán
          Hóa đơn điện tử · Hóa đơn đầu vào · Lịch hẹn · Quản lý mẫu in
Tiện ích: Đặt lịch online · Tích điểm · Đánh giá dịch vụ · Phòng khám
Cửa hàng: Thông tin cửa hàng · Tài khoản người dùng · Quản lý chi nhánh
          Bảo mật cửa hàng · Driver cho phần cứng
Dữ liệu:  Khóa sổ · Lịch sử thao tác · Xóa dữ liệu hệ thống
```

Có ô **"Tìm kiếm thiết lập"** ở đầu trang — nên bắt chước, vì số lượng tuỳ chọn rất lớn.

## 2. Thiết lập Hàng hoá

| Tuỳ chọn | Mô tả |
|---|---|
| Thuộc tính | Phân loại theo màu sắc, kích cỡ, chất liệu (→ biến thể) |
| Đơn vị tính | Chiếc, lốc, thùng… (đơn vị quy đổi) |
| Quản lý theo mã vạch | Mã vạch chuẩn hoặc do cửa hàng tạo |
| **Phương pháp tính giá vốn** | `Giá vốn trung bình` (bình quân gia quyền theo nhập/trả/chuyển) **hoặc** `Giá vốn cố định` |
| Quản lý chi phí nhập hàng | Phí dịch vụ, phí lưu kho… phân bổ vào giá vốn |
| Cho phép giao dịch dù hết tồn kho | Cho phép tồn âm (mặc định TẮT) |
| Không cho phép thay đổi thời gian giao dịch | Áp cho: Hoá đơn · Trả hàng · Nhập hàng · Trả hàng nhập · Chuyển hàng · Xuất huỷ · Xuất dùng · Sổ quỹ · Kiểm kho |

## 3. Thiết lập Đơn hàng

| Tuỳ chọn | Mô tả |
|---|---|
| Quản lý thu khác | Khoản thu thêm khi bán: phí dịch vụ, phí giao hàng… |
| Cho phép in tạm tính/báo giá | In trước khi tạo hoá đơn |
| Tự động hiển thị QR tĩnh | QR ngân hàng của cửa hàng trên màn hình thanh toán |
| Ẩn loại hàng hoá không kinh doanh | Tự ẩn tab Sản phẩm/Dịch vụ/Gói dịch vụ/Thẻ tài khoản trên POS |
| Sắp xếp hàng hoá khi in hoá đơn | `Theo thứ tự chi tiết hoá đơn` **hoặc** `Theo loại hàng` (Dịch vụ → Gói dịch vụ → Thẻ tài khoản → Sản phẩm) |
| Không cho huỷ hoá đơn đã phát hành HĐĐT | Khoá huỷ sau khi xuất hoá đơn điện tử |

## 4. Thiết lập Khách hàng

| Tuỳ chọn | Mô tả |
|---|---|
| Quản lý khách hàng theo chi nhánh | Thông tin/công nợ/điểm tách theo chi nhánh thay vì dùng chung |
| Voucher | Bật/tắt phát hành & thanh toán bằng voucher |
| Khuyến mại | Bật/tắt khuyến mại theo hàng hoá hoặc giá trị đơn |
| Tin nhắn SMS / Email / Zalo | Gửi cho khách và nhà cung cấp |
| Kết nối ZOA-ZNS | Zalo OA có tích hợp API |
| Kết nối SMS (Vietguys) · Kết nối email (Gmail) | Nhà cung cấp gửi tin |

## 5. ⭐ Thiết lập Lịch hẹn (`/p/settings/booking`)

| Tuỳ chọn | Giá trị mặc định | Ý nghĩa |
|---|---|---|
| **Khoảng cách thời gian giữa các dịch vụ** | `5 phút` | Buffer chèn giữa 2 dịch vụ liên tiếp trong cùng lịch hẹn |
| **Lý do huỷ đặt lịch** | 5 lý do | Danh mục lý do, bắt buộc chọn khi huỷ |
| **Giới hạn theo ca làm việc** | TẮT | Khi BẬT: chỉ được đặt lịch cho nhân viên **trong ca làm việc của họ** |

→ Ba quy tắc này phải nằm trong `tenant_settings` của kios-xm.

## 6. Tiện ích

### 6.1 Đặt lịch online
- Khách tự đặt lịch qua **link riêng cho từng gian hàng**: `booksalon.kiotviet.vn/{slug}`
- Có **mã QR** tải về để in/dán tại quầy.
- ⇒ kios-xm cần route public `/(booking)/[tenantSlug]` + sinh QR.

### 6.2 Tích điểm
Tích điểm khi mua hàng · quy đổi điểm để thanh toán đơn · dùng điểm để chia nhóm khách hàng.

### 6.3 Đánh giá dịch vụ
Thiết kế **mẫu đánh giá** + sinh **mã QR in trên mỗi hoá đơn** để khách phản hồi chất lượng.
Kết quả đổ vào báo cáo `Đánh giá dịch vụ` (chấm theo từng KTV).

### 6.4 ⭐ Phòng khám (chuyển mô hình)
> "Bật tính năng để chuyển sang mô hình phòng khám — ghi nhận thông tin y tế khách hàng,
> lập phiếu khám và quản lý lịch khám theo quy trình phòng khám."
>
> "Có thể tắt bất kỳ lúc nào — giao diện trở về Salon nhưng toàn bộ dữ liệu phiếu khám
> và thông tin y tế vẫn được lưu lại."

Gồm:
- **Phiếu khám**: lý do khám · triệu chứng · chẩn đoán · hướng điều trị (theo từng lần khám)
- **Thông tin y tế**: dị ứng · tiền sử bệnh

→ Rất phù hợp với spa thẩm mỹ có yếu tố y khoa (peel, meso, laser). **Nên đưa vào kios-xm
như một module bật/tắt được**, đúng mô hình feature flag theo tenant.

## 7. Dữ liệu & kiểm soát

| Chức năng | Mô tả |
|---|---|
| **Khoá sổ** | Chốt sổ đến một ngày — không cho sửa giao dịch trước ngày đó |
| **Lịch sử thao tác** | Audit log toàn hệ thống |
| **Xoá dữ liệu hệ thống** | Reset dữ liệu (nguy hiểm, cần xác thực) |
| **Bảo mật cửa hàng** | Giới hạn IP/thiết bị, 2FA |
| **Tài khoản người dùng** | Tách với "nhân viên": user đăng nhập ≠ employee |

## 8. Danh mục quỹ (Sổ quỹ)

- 3 loại quỹ: **Tiền mặt · Ngân hàng · Ví điện tử** (+ dòng "Tổng quỹ")
- Phiếu thu / Phiếu chi, có `Loại thu chi` (danh mục) và `Loại chứng từ`
- Cờ **"Kết quả kinh doanh"**: đánh dấu khoản có/không tính vào KQKD
- Số liệu tổng: `Quỹ đầu kỳ` · `Tổng thu` · `Tổng chi` · `Tồn quỹ`
- Cột: Mã phiếu · Thời gian · Loại thu chi · Người nộp/nhận · Mã · SĐT · Số tiền

## 9. Bộ lọc hoá đơn (gợi ý cho báo cáo)

Thời gian · Trạng thái (Hoàn thành / Còn nợ) · khoảng Từ–Tới ·
**Nhân viên thực hiện** · **Nhân viên tư vấn** · Kênh bán · Phương thức thanh toán ·
Bảng giá · Loại thu khác.

Cột: Mã hoá đơn · Thời gian · Khách hàng · Tổng tiền hàng · Giảm giá ·
Tổng sau giảm giá · Khách đã trả.

## 10. Bộ lọc "Thẻ & gói đã bán"

Loại hàng (Gói dịch vụ / Thẻ tài khoản) · Trạng thái · Hạn sử dụng (Tất cả / Vô thời hạn /
khoảng ngày) · Ngày bán · Nhóm khách hàng.

Cột: Mã gói · Tên gói · Mã KH · Khách hàng · Giá bán · **Đã dùng** · **Còn lại** · Hạn sử dụng.

## 11. Danh sách báo cáo cần có

`Cuối ngày` · `Bán hàng` · `Tài chính` · `Hàng hoá` · `Nhà cung cấp` · `Khách hàng` ·
`Gói, thẻ đã bán` · `Đánh giá dịch vụ` · `Nhân viên` · `Kênh bán`
\+ nhóm **Phân tích xu hướng**: Khách hàng (gắn kết) · Doanh thu (dòng tiền, biến động) ·
Nhân viên (hiệu suất).
