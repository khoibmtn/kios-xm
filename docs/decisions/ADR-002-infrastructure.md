# ADR-002 — Hạ tầng chi phí tối thiểu + lưu trữ trên Google Drive

**Ngày**: 05/09/2026 · **Trạng thái**: Đề xuất, chờ anh Khôi duyệt

**Yêu cầu của anh Khôi**: lưu trữ dùng **Google Drive** (đã có sẵn 2 TB, sẽ cung cấp ID
thư mục); ứng dụng phải **vận hành được với chi phí tối thiểu**, bước đầu dùng các **gói
miễn phí**.

---

## PHẦN 1 — HAI PHÁT HIỆN LÀM ĐỔI KẾ HOẠCH

### 1.1 ⚠️ Vercel Hobby **cấm dùng cho mục đích thương mại**

Điều khoản Fair Use của Vercel quy định gói Hobby chỉ dành cho **cá nhân, phi thương mại**;
mọi sử dụng thương mại bắt buộc phải dùng Pro hoặc Enterprise. Định nghĩa "thương mại" rất
rộng — bao gồm cả trường hợp **có người được trả tiền để viết code**, không nhất thiết phải
có thanh toán trên chính website.

Một phần mềm vận hành spa đang kinh doanh **chắc chắn thuộc diện thương mại**.

⇒ **Không thể dùng Vercel Hobby.** Vercel Pro là **20 $/tháng/người**. Đây là lý do phải
đổi nhà cung cấp hosting, dù bản thiết kế ban đầu ghi "triển khai trên Vercel".

> Đây là điểm cả bản thiết kế của tôi lẫn phản biện của ChatGPT đều bỏ sót.

### 1.2 ⚠️ Google Drive **Service Account có hạn mức 0 GB**

Từ 01/06/2023, các service account mới được cấp hạn mức lưu trữ **0 GB**. Upload bằng
service account trả về lỗi `403 storageQuotaExceeded` — *"Service Accounts do not have
storage quota"*. **Chia sẻ thư mục cá nhân cho service account cũng không giải quyết được**,
vì dung lượng bị tính vào chính service account.

Chỉ có hai đường:
- **(a) Shared Drive** — cần Google Workspace Business, không áp dụng cho Google One cá nhân
- **(b) OAuth 2.0 uỷ quyền tài khoản thật** — app giữ `refresh_token` của tài khoản anh Khôi,
  dung lượng tính vào 2 TB sẵn có ✅

⇒ **Phải dùng phương án (b).**

---

## PHẦN 2 — THIẾT KẾ LƯU TRỮ TRÊN GOOGLE DRIVE

### 2.1 Cơ chế

```
Ứng dụng ──(OAuth refresh_token của anh Khôi, scope drive.file)──► Google Drive API
                                                                        │
                            2 TB Google One của anh Khôi ◄──────────────┘
```

- **Scope**: `https://www.googleapis.com/auth/drive.file` — chỉ truy cập được file **do
  chính ứng dụng tạo**. Đây là scope không thuộc nhóm "restricted", nên thủ tục xét duyệt
  nhẹ hơn nhiều so với scope `drive` toàn quyền. App cũng **không đọc được** các file khác
  trong Drive của anh — an toàn hơn cho anh.
- Anh Khôi cấp quyền **một lần**, hệ thống lưu `refresh_token` đã mã hoá.
- **Bắt buộc**: đưa OAuth app sang trạng thái **"In production"**. Nếu để "Testing",
  `refresh_token` **hết hạn sau 7 ngày** và hệ thống sẽ ngừng lưu ảnh.

### 2.2 ⚠️ Thư mục gốc phải do chính ứng dụng tạo

**Phát hiện khi cấu hình thật (05/09/2026):** scope `drive.file` chỉ cho phép truy cập
**những tệp/thư mục do chính ứng dụng tạo ra**, hoặc do người dùng chọn qua Google Picker.
Một thư mục có sẵn — dù đã bật chia sẻ — vẫn **không nhìn thấy được** từ phía ứng dụng;
gọi `files.create` với `parents:[folderId]` sẽ trả về `404 File not found`.

Anh Khôi đã tạo sẵn thư mục `1yWzNKJwykbpCk4wBbKXhS99pX3Xty1--`, nhưng **không dùng
trực tiếp được**. Ba lựa chọn:

| Phương án | Đánh giá |
|---|---|
| **① Ứng dụng tự tạo thư mục gốc** ⭐ | Đơn giản nhất, giữ scope hẹp, không cần thủ tục xét duyệt. Sau khi tạo, anh **kéo thư mục đó vào bất kỳ đâu trong Drive** (kể cả vào trong thư mục đã tạo sẵn) — ứng dụng vẫn ghi được bình thường, vì quyền gắn với **tệp**, không gắn với vị trí |
| ② Tích hợp Google Picker | Cho phép chọn đúng thư mục có sẵn, vẫn giữ scope hẹp, nhưng phải làm thêm màn hình chọn + API key. Để dành nếu sau này cần |
| ③ Dùng scope `drive` toàn quyền | ❌ Không nên: đây là *restricted scope*, Google bắt buộc đánh giá bảo mật, và ứng dụng sẽ đọc được **toàn bộ** Drive của anh — rủi ro không cần thiết |

**Chọn phương án ①.** `GOOGLE_DRIVE_ROOT_FOLDER_ID` để trống lúc đầu; lần kết nối đầu tiên
hệ thống tạo thư mục `kios-xm-data` rồi tự ghi lại ID.

```
kios-xm-data/                              ← do ứng dụng tạo, anh tự kéo vào chỗ mong muốn
├── customers/{yyyy}/{mm}/{customerId}/     ← ảnh trước/sau, ảnh hồ sơ
├── products/                               ← ảnh hàng hoá
├── invoices/{yyyy}/{mm}/                   ← PDF hoá đơn đã xuất
└── backups/{yyyy-mm-dd}/                   ← bản sao lưu cơ sở dữ liệu (pg_dump.gz)
```

Chia theo năm/tháng vì Drive giới hạn **500.000 mục trong một thư mục**.

### 2.3 Hạn mức Drive API — đối chiếu nhu cầu thật của spa

| Hạn mức Google | Nhu cầu spa (ước tính) | Kết luận |
|---|---|---|
| 12.000 truy vấn / 60 giây | ~200–500 truy vấn/ngày | Thoải mái |
| 750 GB upload / 24 giờ | ~50–200 MB/ngày | Thoải mái |
| 500.000 mục / thư mục | Đã chia theo tháng | An toàn |
| 2 TB dung lượng | ~30 khách/ngày × 4 ảnh × 1 MB ≈ **44 GB/năm** | Đủ dùng **~45 năm** |

### 2.4 Ba nhược điểm phải xử lý (nói thẳng)

| Nhược điểm | Cách xử lý |
|---|---|
| **Drive không phải CDN** — độ trễ 300–800 ms, không tối ưu cho web | Tạo **thumbnail** (400px, WebP) lúc upload, cache ở tầng ứng dụng/Cloudflare; ảnh gốc chỉ tải khi bấm phóng to |
| **Ảnh y tế nằm trên Drive cá nhân** | Tuyệt đối **không** dùng link chia sẻ công khai. Mọi ảnh phục vụ qua endpoint có kiểm tra quyền (`medical.image_view`), ghi `audit_log` mỗi lần xem |
| **Phụ thuộc một tài khoản Google** | `refresh_token` mã hoá bằng khoá riêng; có màn hình "kết nối lại Google Drive" khi token hỏng; cảnh báo sớm nếu upload lỗi |

### 2.5 Thiết kế thoát hiểm — `StorageAdapter`

Toàn bộ mã ứng dụng **không gọi Drive API trực tiếp**, mà qua một giao diện:

```ts
interface StorageAdapter {
  put(path: string, data: Buffer, mime: string): Promise<StoredFile>
  getStream(fileId: string): Promise<ReadableStream>
  getSignedUrl(fileId: string, ttlSec: number): Promise<string>
  delete(fileId: string): Promise<void>
}
```

Ba hiện thực: `GoogleDriveAdapter` (dùng ngay) · `R2Adapter` (Cloudflare R2, khi cần tốc độ)
· `S3Adapter` (dự phòng). Đổi nhà cung cấp = đổi biến môi trường + chạy script chuyển file,
**không sửa nghiệp vụ**.

Bảng `files` trong cơ sở dữ liệu luôn giữ: `provider`, `external_id`, `path`, `mime`,
`size`, `checksum` ⇒ chuyển nhà cung cấp không mất dấu vết.

---

## PHẦN 3 — HOSTING & CƠ SỞ DỮ LIỆU

### 3.1 So sánh phương án

| | **A · Không đồng** | **B · Tối thiểu thực dụng** ⭐ | **C · Tự chủ** |
|---|---|---|---|
| Hosting | Cloudflare Workers **Free** | Cloudflare Workers **Paid** | VPS Hetzner CX22 |
| Giới hạn | 100k req/ngày, **CPU 10 ms/req** | 10 triệu req/tháng, CPU 30 s | Không giới hạn |
| Cơ sở dữ liệu | Supabase **Free** (500 MB) | Supabase **Free** (500 MB) | Postgres tự cài |
| Lưu trữ | Google Drive | Google Drive | Google Drive |
| **Chi phí/tháng** | **0 đ** | **≈ 5 $** (~130.000 đ) | **≈ 5 €** (~140.000 đ) |
| Rủi ro chính | **CPU 10 ms rất chặt với Next.js SSR** | Gần như không | Phải tự quản trị, tự vá bảo mật |

**Cloudflare cho phép dùng gói miễn phí cho mục đích thương mại** — khác hẳn Vercel.
**Supabase Free cũng cho phép thương mại**, không cần thẻ tín dụng.

### 3.2 Khuyến nghị

> **Giai đoạn phát triển (M0–M2): phương án A — 0 đồng.**
> **Khi bắt đầu vận hành thật (từ M3.1): chuyển sang phương án B — 5 $/tháng.**

Lý do không khuyến nghị bám phương án A khi chạy thật: giới hạn **10 ms CPU mỗi request**
của gói Workers miễn phí rất chặt với một ứng dụng Next.js có kết xuất phía máy chủ. Khi
vượt, Cloudflare trả lỗi 1027 và **trang ngừng phục vụ** — không chấp nhận được với phần
mềm thu ngân đang có khách đứng chờ. 5 $/tháng loại bỏ hoàn toàn rủi ro này.

Nếu anh muốn tuyệt đối 0 đồng khi chạy thật, cần đánh đổi: kết xuất tĩnh tối đa, đẩy phần
lớn xử lý xuống trình duyệt. Làm được nhưng phức tạp hơn và giới hạn tính năng.

### 3.3 Vấn đề Supabase Free — và cách xử lý

| Hạn chế thật | Ảnh hưởng | Xử lý |
|---|---|---|
| **500 MB cơ sở dữ liệu** | Dữ liệu spa chủ yếu là chữ và số. Đối chiếu thực tế: 510 hoá đơn + 196 hàng hoá + 81 khách ≈ **dưới 20 MB**. Ảnh không nằm trong DB | Đủ cho **nhiều năm**. Cảnh báo khi đạt 400 MB |
| **Không có sao lưu nào** ⚠️ | Mất dữ liệu = mất sổ sách kinh doanh | **Tự sao lưu**: cron hằng ngày chạy `pg_dump` → nén → đẩy lên `Drive/backups/`. Giữ 30 bản. Đây chính là chỗ 2 TB Drive phát huy tác dụng |
| **Tạm dừng sau 7 ngày không có truy vấn** | Spa hoạt động hằng ngày nên hiếm khi xảy ra — trừ nghỉ Tết dài | Cron ping mỗi ngày (ghi 1 dòng vào bảng `heartbeat`) |
| Không có SLA | Chấp nhận được ở quy mô 1 spa | Khi cần cam kết → Supabase Pro 25 $ |

### 3.5 Chuỗi kết nối Supabase — còn thiếu mật khẩu

Đã lấy được và ghi vào `.env.local`:

```
DATABASE_URL  → postgres.fdqnwdowqyocaqmkkkrv@aws-0-ap-northeast-1.pooler.supabase.com:6543  (pooler, dùng lúc chạy)
DIRECT_URL    → postgres.fdqnwdowqyocaqmkkkrv@aws-0-ap-northeast-1.pooler.supabase.com:5432  (trực tiếp, dùng cho migrate)
```

Region **ap-northeast-1 (Tokyo)** — độ trễ tới Việt Nam thấp, lựa chọn tốt.

⚠️ Chỗ `[YOUR-PASSWORD]` cần thay bằng mật khẩu cơ sở dữ liệu. Supabase ghi rõ:
*"The database password isn't viewable after creation"* — **không xem lại được**.

Hai cách:
- Anh Khôi còn nhớ mật khẩu đặt lúc tạo project → gửi để điền vào `.env.local`
- Hoặc vào **Database Settings → Reset password** đặt mật khẩu mới (project chưa có dữ
  liệu nên reset hoàn toàn an toàn)

> ChatGPT khuyến nghị Supabase **Pro 25 $ ngay từ M0** — tôi **không đồng ý** với ràng buộc
> chi phí của anh. Nhưng ChatGPT **đúng khi chỉ ra lỗi trong yêu cầu phi chức năng của tôi**:
> tôi viết "sao lưu 30 ngày, khôi phục theo thời điểm" mà không đối chiếu gói dịch vụ.
> Sự thật: Free **không có backup**, Pro có sao lưu hằng ngày giữ **7 ngày**, còn khôi phục
> theo thời điểm (PITR) là **tính năng trả thêm tiền**. Yêu cầu phi chức năng đã được sửa lại.

### 3.4 Yêu cầu sao lưu — bản sửa lại

| Trước (sai) | Sau (đúng với hạ tầng thật) |
|---|---|
| "Sao lưu tự động hằng ngày, giữ 30 ngày, khôi phục theo thời điểm" | **Sao lưu logic hằng ngày** bằng `pg_dump` → Google Drive, **giữ 30 bản**. Kiểm thử khôi phục **mỗi quý**. Chưa cần khôi phục theo thời điểm ở quy mô 1 spa; xem xét lại khi có nhiều chi nhánh hoặc nhiều spa |

---

## PHẦN 4 — CHI PHÍ THEO QUY MÔ

| Quy mô | Hosting | CSDL | Lưu trữ | **Tổng/tháng** |
|---|---|---|---|---|
| **Phát triển** | CF Free 0 $ | Supabase Free 0 $ | Drive 0 $ | **0 đ** |
| **1 spa chạy thật** | CF Paid 5 $ | Supabase Free 0 $ | Drive 0 $ | **≈ 130.000 đ** |
| **1 spa, dữ liệu > 500 MB** | CF Paid 5 $ | Supabase Pro 25 $ | Drive 0 $ | ≈ 790.000 đ |
| **5–10 spa** | CF Paid 5 $ | Supabase Pro 25 $ | Drive/R2 | ≈ 790.000 đ |

Mốc chuyển đổi đáng chú ý: nếu sau này bán cho nhiều spa, phần đắt lên **không phải database
mà là ảnh**. Khi đó chuyển `StorageAdapter` sang **Cloudflare R2** (không tính phí băng thông
ra) — đã có sẵn đường thoát ở mục 2.5.

---

## PHẦN 5 — QUYẾT ĐỊNH ĐỀ XUẤT

1. **Hosting**: Cloudflare Workers (Free khi phát triển → Paid 5 $ khi chạy thật).
   **Bỏ Vercel** vì gói Hobby cấm dùng thương mại.
2. **Cơ sở dữ liệu**: Supabase Free, dùng như **PostgreSQL có quản lý** — qua Prisma và SQL
   thuần, **không** dùng RLS làm lõi phân quyền, **không** dùng Edge Function độc quyền.
   Giữ nguyên nguyên tắc trung lập đã cam kết.
3. **Lưu trữ**: Google Drive qua OAuth tài khoản anh Khôi, scope `drive.file`, sau lớp
   `StorageAdapter`.
4. **Sao lưu**: `pg_dump` hằng ngày lên Drive, giữ 30 bản, kiểm thử khôi phục hằng quý.
5. **Chi phí mục tiêu**: **0 đ** trong giai đoạn phát triển, **≈ 130.000 đ/tháng** khi vận hành.

## Tình trạng chuẩn bị (cập nhật 05/09/2026)

| Việc | Trạng thái |
|---|---|
| Tạo thư mục Drive | ✅ Xong — nhưng **không dùng trực tiếp được**, xem §2.2. Ứng dụng sẽ tự tạo thư mục riêng |
| Google Cloud project + OAuth Client ID (web) | ✅ `just-rhythm-507701-c4`, client tên **"Spa management"**, tài khoản chủ sở hữu: `nguyenthithuhuong.k31h@gmail.com` |
| `client_id` / `client_secret` | ✅ Đã nạp vào `.env.local` (chmod 600, đã chặn khỏi git) |
| Đăng ký Cloudflare + Supabase | ✅ Xong |
| Authorized redirect URI | ✅ `http://localhost:3000/api/drive/callback` (đã kiểm chứng còn sau khi tải lại trang) |
| Google Drive API | ✅ Đã bật sẵn |
| Scope `drive.file` khai trong Data Access | ✅ Đã thêm — nằm ở nhóm **non-sensitive**, không cần xét duyệt |
| Test users | ✅ 2 tài khoản: `nguyenthithuhuong.k31h@gmail.com`, `khoibm.tn@gmail.com` |
| Supabase project | ✅ `fdqnwdowqyocaqmkkkrv`, org `khoibmtn's Org` (FREE), compute NANO, region **ap-northeast-1 (Tokyo)** |
| Chuỗi kết nối Supabase | ✅ Đã ghi vào `.env.local`, **còn thiếu mật khẩu** (xem §3.5) |
| Đưa OAuth app sang "In production" | ⚠️ **Chưa làm được — xem §2.6** |

### 2.6 ⚠️ Vì sao chưa publish được, và vì sao chưa cần vội

Nút **Publish app** vẫn bị khoá kèm thông báo *"Your app's OAuth configuration is
incomplete… Please visit the Branding page"*. Trang Branding đã điền đủ mọi trường bắt
buộc (App name, User support email, Developer contact). Phần còn trống là **App domain**:
trang chủ ứng dụng, liên kết chính sách bảo mật, điều khoản dịch vụ, và **Authorized
domains** — Google đòi những thứ này để chuyển app External sang production, và authorized
domain phải là **tên miền đã xác minh quyền sở hữu**.

Hiện dự án **chưa có tên miền**, nên chưa thể hoàn tất.

**Điều đó không chặn công việc.** Ở trạng thái *Testing* + đã khai test user, luồng OAuth
chạy bình thường. Hệ quả duy nhất: **refresh token hết hạn sau 7 ngày**, tức trong giai
đoạn phát triển thỉnh thoảng phải bấm "Kết nối lại Google Drive".

⇒ Hai việc bắt buộc trong thiết kế, làm ngay từ M0:
1. Màn hình **"Kết nối lại Google Drive"** trong phần Thiết lập.
2. Hệ thống **phát hiện token hỏng → cảnh báo rõ ràng**, và **không được làm mất dữ liệu**:
   nếu upload ảnh thất bại thì xếp vào hàng đợi, thử lại sau khi kết nối lại.

**Khi nào publish được:** lúc triển khai thật, ứng dụng sẽ có tên miền. Khi đó viết 2 trang
tĩnh `/privacy` và `/terms`, khai vào Branding, xác minh tên miền, rồi Publish. Từ đó
refresh token không còn hết hạn. Nếu dùng tên miền dạng `*.workers.dev` mà Google không cho
xác minh, phương án dự phòng là mua một tên miền riêng (~250.000 đ/năm).

### Giá trị cần dán vào Google Cloud Console

**APIs & Services → Credentials → OAuth 2.0 Client IDs → Authorized redirect URIs:**

```
http://localhost:3000/api/drive/callback
```

*(Khi triển khai thật sẽ bổ sung thêm URL production của Cloudflare Workers.)*

**Authorized JavaScript origins:** để trống — hệ thống dùng luồng authorization code phía
máy chủ, không cần.

⚠️ Redirect URI phải **trùng khớp từng ký tự** với biến `GOOGLE_REDIRECT_URI` trong
`.env.local`, kể cả dấu `/` cuối. Sai một ký tự sẽ báo lỗi `redirect_uri_mismatch`.

---

## Nguồn tham khảo

- [Vercel Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines)
- [Vercel Hobby Plan](https://vercel.com/docs/plans/hobby)
- [Cloudflare Pages Functions Pricing](https://developers.cloudflare.com/pages/functions/pricing/)
- [Cloudflare Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Google Drive API — Usage limits](https://developers.google.com/workspace/drive/api/guides/limits)
- Thảo luận chính thức về hạn mức 0 GB của service account:
  [Google Developer Forums](https://discuss.google.dev/t/storagequotaexceeded-the-users-drive-storage-quota-has-been-exceeded-for-service-account/104375)
