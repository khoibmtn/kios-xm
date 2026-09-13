# ADR-004 — Quản trị viên nền tảng, gian hàng, và ranh giới cấu hình

*Ngày 13/09/2026 · anh Khôi chốt hướng sản phẩm*

## Bối cảnh

Quyết định Q1 hồi 05/09 là *"1 spa trước, chừa đường mở rộng"*: cơ sở dữ liệu
đã có `tenant_id` ở mọi bảng nhưng chưa có giao diện quản lý nhiều spa.

Nay anh Khôi chốt hình dạng sản phẩm:

> Một **quản trị viên** quản trị các **gian hàng**. Mỗi gian hàng có **chủ gian
> hàng** và một hoặc nhiều **chi nhánh** (như hiện tại). Quản trị viên cấu hình
> các **tham số** của mỗi gian hàng, còn chủ gian hàng cấu hình các **chi tiết
> vận hành** của mình.

Tức là thêm đúng **một tầng** phía trên mô hình đang chạy:

```
Quản trị viên nền tảng          ← mới
└── Gian hàng (tenant)          ← đã có, mỗi gian hàng một chủ
    └── Chi nhánh (branch)      ← đã có, 1..n
        └── Người dùng, vai trò, dữ liệu nghiệp vụ
```

Spa Xumây là gian hàng đầu tiên. Không có gì trong mô hình này buộc phải đổi
dữ liệu đang chạy.

## Quyết định 1 — Quản trị viên là một loại chủ thể khác, không phải một vai trò

`users.tenant_id` là `NOT NULL`, và `roles.tenant_id` cũng vậy. Đó **không phải
là chuyện tình cờ**: chính ràng buộc ấy là thứ bảo đảm mọi truy vấn nghiệp vụ
đều nằm gọn trong một gian hàng. Mọi phương án kiểu "cho `tenant_id` nhận NULL"
hay "thêm cờ `is_super_admin`" đều **mở một lỗ hổng xuyên qua ranh giới ấy ở
mọi truy vấn cùng lúc** — chỉ cần một chỗ quên kiểm tra cờ là dữ liệu gian hàng
này chảy sang gian hàng khác.

⇒ Quản trị viên nền tảng ở trong **bảng riêng** (`platform_admins`), đăng nhập
qua **bề mặt riêng** (`/platform`), và **không bao giờ** xuất hiện trong
`users`. Ba bề mặt hiện có (`/admin`, `/pos`, và trang công khai sau này) không
đổi gì.

Hệ quả cố ý: một truy vấn nghiệp vụ **không thể** vô tình chạy với quyền quản
trị viên, vì phiên của quản trị viên không mang `tenantId` nào cả.

### Thay mặt gian hàng thì phải để lại dấu vết

Quản trị viên cần xem được gian hàng để hỗ trợ. Việc đó **không được** làm bằng
cách mượn tài khoản chủ gian hàng. Phải là một thao tác tường minh, có hạn thời
gian, và **ghi nhật ký cả lúc bắt đầu lẫn lúc kết thúc** — nhật ký ghi rõ "quản
trị viên X thay mặt gian hàng Y", không phải ghi như thể chủ gian hàng tự làm.

## Quyết định 2 — Ranh giới cấu hình: tham số ở trên, vận hành ở dưới

Đây là phần trả lời trực tiếp cho **T-38** (bốn thiết lập lưu mà không thi hành).

**Nguyên tắc phân chia.** Thứ gì đổi đi làm **số liệu quá khứ hết so sánh được**,
hoặc quyết định gian hàng **được phép làm gì**, thì thuộc quản trị viên. Thứ gì
là cách spa chạy công việc **hằng ngày** thì thuộc chủ gian hàng.

| Cấu hình | Thuộc về | Vì sao |
|---|---|---|
| Gói dịch vụ, hạn mức chi nhánh/nhân viên/lưu trữ | Quản trị viên | Quyết định gian hàng được phép làm gì |
| Bật/tắt tính năng (`tenant_features`) | Quản trị viên | Cùng lý do |
| `costing_method` — phương pháp giá vốn | **Quản trị viên** | Đổi giữa chừng thì giá vốn trước và sau không còn so sánh được |
| `package_revenue_allocation_mode` — phân bổ doanh thu gói | **Quản trị viên** | Cùng lý do: nó quyết định cách ghi nhận doanh thu |
| `booking_slot_minutes`, `booking_buffer_minutes` | Chủ gian hàng | Nhịp làm việc của spa |
| `limit_booking_to_shift` — chỉ đặt lịch trong ca | Chủ gian hàng | Quy tắc vận hành của spa |
| `book_closed_until` — khoá sổ đến ngày | Chủ gian hàng | Chủ spa tự chốt sổ của mình |
| Chi nhánh, nhân viên, vai trò, giá, khuyến mại | Chủ gian hàng | Vận hành |

### Hệ quả trước mắt cho T-38

Bốn thiết lập đang nằm trên màn hình Cấu hình chung mà **không dòng mã nào
đọc**. Sau ADR này chúng được xử lý làm hai nhóm:

- `costing_method` và `package_revenue_allocation_mode` — **thuộc quản trị
  viên**, mà bề mặt `/platform` thì chưa dựng. ⇒ **Ẩn khỏi màn hình của chủ gian
  hàng ngay**, kèm ghi chú "do quản trị viên đặt". Để nguyên là bày ra một công
  tắc mà người bật không có thẩm quyền bật, lại còn chẳng có tác dụng gì.
- `limit_booking_to_shift` và `book_closed_until` — **thuộc chủ gian hàng**, giữ
  nguyên chỗ cũ nhưng **phải nối vào mã thật**: bật giới hạn ca thì đặt lịch
  ngoài ca bị chặn, khoá sổ tới ngày nào thì không ghi được chứng từ trước ngày
  đó.

Tiêu chí nghiệm thu cho mọi thiết lập, từ đây trở đi: **đổi nó thì thấy hành vi
khác đi**. "Lưu xuống được" không tính (xem bài học 12/09 trong `PROGRESS.md`).

## Quyết định 3 — Chưa dựng ngay, nhưng không được làm gì cản đường

Spa Xumây đang cần kho, lương và báo cáo hơn là cần màn hình quản trị nhiều
gian hàng. Nên `/platform` **chưa dựng bây giờ**.

Điều bắt buộc từ hôm nay: mọi thứ viết thêm phải **không cản đường** tầng ấy.

1. Mọi truy vấn nghiệp vụ **luôn** lọc theo `tenant_id` lấy từ phiên đăng nhập,
   không bao giờ lấy từ tham số do trình duyệt gửi lên. (Đã là quy tắc sẵn —
   xem bài học 05/09 về `loadOrgUnits(tenantId)` trong `PROGRESS.md`.)
2. Không viết thêm thiết lập nào vào `tenant_settings` mà chưa xếp nó vào một
   trong hai cột ở bảng trên.
3. Không giả định "chỉ có một gian hàng" trong bất kỳ truy vấn nào — kể cả các
   kịch bản chạy ngoài app. `scripts/backup.ts` hiện đang lấy
   `tenants.limit(1)`; chỗ đó phải sửa khi có gian hàng thứ hai, đã ghi thành
   task.

## Ảnh hưởng tới các quyết định cũ

- **Q1 (05/09)** — *"1 spa trước, chừa đường mở rộng"*: vẫn đúng về thứ tự làm,
  nhưng đích đến nay đã rõ hình dạng. ADR này thay phần "chưa làm UI quản lý
  tenant" bằng một thiết kế cụ thể.
- **ADR-001 §4 (phân quyền)**: năm vai trò hiện có đều nằm **trong** một gian
  hàng và không đổi. Quản trị viên nền tảng là chủ thể thứ sáu, ở ngoài.
