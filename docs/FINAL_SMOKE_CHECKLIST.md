# Checklist smoke test cuối cùng (thực hiện thủ công)

Kiểm thử click-through trên trình duyệt chưa được thực hiện. Checklist
dưới đây dùng để xác nhận luồng giao diện trước khi phát hành, không
dùng Playwright/Cypress/Selenium hay bất kỳ công cụ điều khiển trình
duyệt tự động nào.

Các phần không liên quan trình duyệt đã được xác minh: backend chạy
thật với PostgreSQL thật (transaction, đọc/ghi Repository, REST API
tạo/đọc hoá đơn), typecheck và build của backend/frontend đều đạt,
health endpoint và dev server backend/frontend cùng Vite proxy `/api`
hoạt động đúng. Riêng thao tác click-through trong trình duyệt bên
dưới vẫn cần thực hiện thủ công và xác nhận kết quả trước khi coi
giao diện trình duyệt là sẵn sàng phát hành.

## Chuẩn bị

**Quan trọng — backend KHÔNG tự động đọc file `.env`:** backend này
không dùng dotenv và không có bất kỳ cơ chế nào tự nạp
`backend/.env`. `backend/src/config/database.config.ts` chỉ đọc đúng
biến môi trường `process.env.DATABASE_URL` của chính tiến trình Node
đang chạy. Vì vậy chỉ sửa file `.env` là **KHÔNG ĐỦ** —
`DATABASE_URL` phải thực sự có mặt trong biến môi trường của cửa sổ
PowerShell (hoặc shell khác) TRƯỚC KHI chạy `npm start`/`npm run dev`.

### 1. Đặt DATABASE_URL trong PowerShell (môi trường kiểm thử thủ công)

```powershell
$env:DATABASE_URL = '<SUPABASE_DATABASE_URL>'
```

Kiểm tra biến đã có mặt — CHỈ kiểm tra sự tồn tại, không in giá trị:

```powershell
if ($env:DATABASE_URL) {
    Write-Host "DATABASE_URL_PRESENT=true"
} else {
    Write-Host "DATABASE_URL_PRESENT=false"
}
```

Lưu ý bắt buộc:

- **Không bao giờ** in giá trị thật của `DATABASE_URL` ra màn hình,
  log, hay bất kỳ đâu (không `echo $env:DATABASE_URL`, không dán vào
  file/issue/chat).
- **Không bao giờ** commit giá trị này vào repository.
- `$env:DATABASE_URL` chỉ áp dụng cho tiến trình PowerShell hiện tại
  và các tiến trình con nó khởi động (ví dụ `npm start` chạy từ chính
  cửa sổ đó) — đóng cửa sổ PowerShell sẽ mất biến này; mở một cửa sổ
  PowerShell khác mà chưa đặt lại biến sẽ khiến backend chạy **không
  có** `DATABASE_URL`.
- Phải chạy backend (bước 2 bên dưới) **từ chính session PowerShell**
  vừa đặt `$env:DATABASE_URL` ở trên.

### 2. Chạy backend

Trong cùng session PowerShell đã đặt `$env:DATABASE_URL`:

```powershell
cd backend
npm install
npm run build
npm start
```

(hoặc `npm run dev` thay cho `npm run build` + `npm start`, nếu muốn
auto-reload — cũng phải chạy từ cùng session đã đặt biến).

Xác nhận `GET http://localhost:3000/api/v1/health` trả về
`{"success":true,"data":{"status":"ok"}}`.

### 3. (Tuỳ chọn) Lưu DATABASE_URL cục bộ trong backend/.env

`backend/.env` bị git-ignore và có thể dùng làm nơi lưu secret cục bộ
để tra lại sau — nhưng **ứng dụng không tự động đọc file này** (không
có dotenv trong dependency của backend, và sẽ không thêm chỉ để tránh
bước này — xem `docs/DATABASE_ACCESS.md`). Nếu lưu `DATABASE_URL`
trong `backend/.env`, vẫn phải tự nạp giá trị đó vào biến môi trường
của session PowerShell trước khi chạy Node.

**Thư mục làm việc bắt buộc cho lệnh dưới đây: `backend/`** (tức là đã
`cd backend` như bước 2 — đường dẫn tới file là `.env`, KHÔNG phải
`backend\.env`, vì đã đứng trong `backend/` rồi):

```powershell
Get-Content .env | ForEach-Object {
    if ($_ -match '^\s*DATABASE_URL\s*=\s*(.+)$') {
        $env:DATABASE_URL = $Matches[1].Trim()
    }
}
```

### 4. Nền tảng khác (Bash/Linux) — tuỳ chọn

PowerShell là hướng dẫn chính vì đây là môi trường Windows/PowerShell
được dùng để kiểm thử thủ công. Nếu chạy trên Bash/Linux thay vì
PowerShell, tương đương là:

```bash
export DATABASE_URL='<SUPABASE_DATABASE_URL>'
cd backend && npm install && npm run build && npm start
```

### 5. Chạy frontend

Mở terminal thứ hai: `cd frontend && npm install && npm run dev` —
ghi lại URL local mà Vite in ra (`http://localhost:5173` hoặc cổng
trống kế tiếp).

## Kỳ billing cố định dùng cho checklist này

Toàn bộ checklist dùng đúng MỘT kỳ billing: **tháng 2026-10** (UI nhập
`2026-10`, wire `billingPeriod = "2026-10-01"`). Kỳ này được chọn có
chủ đích, không tuỳ ý: biểu giá điện seed mặc định có hiệu lực
`2025-05-10` → `2026-12-31`, và biểu giá nước seed mặc định có hiệu
lực từ `2026-09-06` (không có ngày hết hiệu lực) — `2026-10-01` thoả cả
hai điều kiện hiệu lực đó cùng lúc. Một kỳ khác (ví dụ `2026-09`) có
thể không thoả điều kiện hiệu lực của biểu giá nước và khiến bước tạo
hoá đơn thất bại với `TARIFF_NOT_FOUND`. Dùng **cùng** `2026-10` cho cả
chỉ số công tơ điện, chỉ số công tơ nước, tạo hoá đơn, và đọc lại hoá
đơn ở dưới.

## Checklist

1. [ ] Mở URL frontend trên trình duyệt. Khung ứng dụng và thanh điều
       hướng bên hiển thị, không có trang trắng.
2. [ ] Vào màn hình Bất động sản, tạo một bất động sản mới với tên và
       địa chỉ; nó xuất hiện ngay trong danh sách sau khi tạo.
3. [ ] Chọn bất động sản đó, tạo một phòng mới với `tenantCount = 4`;
       phòng xuất hiện dưới bất động sản tương ứng.
4. [ ] Chọn phòng đó. Nhập chỉ số công tơ điện cho tháng `2026-10`:
       chỉ số cũ `0`, chỉ số mới `120`.
5. [ ] Nhập chỉ số công tơ nước cho cùng tháng `2026-10`: chỉ số cũ
       `0`, chỉ số mới `12`.
6. [ ] Mở màn hình cấu hình biểu giá điện — xác nhận biểu giá seed mặc
       định "Biểu giá điện mặc định" (6 bậc) hiển thị đúng (VAT `0.0800`,
       số người/định mức `4`, bậc dự phòng `3`).
7. [ ] Mở màn hình cấu hình biểu giá nước — xác nhận biểu giá seed mặc
       định "Biểu giá nước mặc định" hiển thị đúng giá/VAT/phí môi
       trường.
8. [ ] Vào màn hình Hóa đơn, chọn đúng bất động sản và phòng đã dùng ở
       trên.
9. [ ] Chọn tháng `2026-10` (kỳ billing cố định của checklist này).
10. [ ] Chọn phương pháp tính điện `QUOTA_TIERED`.
11. [ ] Chọn phương pháp tính nước `PER_CUBIC_METER`.
12. [ ] **Trước khi bấm "Tạo hóa đơn":** nhập một số tiền thực thu khác
        với tổng hợp pháp dự kiến — dùng giá trị cố định
        `actualChargedAmount = 400000` (bốn trăm nghìn đồng) để kết quả
        có thể dự đoán trước. Đây LÀ bắt buộc phải nhập trước khi tạo:
        `actualChargedAmount` chỉ được gửi cùng
        `POST /api/v1/invoices` lúc tạo — không có endpoint nào để sửa
        giá trị này sau khi hoá đơn đã được tạo, nên KHÔNG được tạo hoá
        đơn trước rồi mới quay lại nhập số tiền thực thu.
13. [ ] Bấm "Tạo hóa đơn" — chỉ MỘT LẦN cho phòng/tháng này (tạo lần
        thứ hai cho cùng phòng/tháng sẽ trả về `INVOICE_ALREADY_EXISTS`
        theo đúng thiết kế, không phải lỗi).
14. [ ] Xác nhận phần breakdown của hoá đơn hiển thị đủ dòng cho từng
        bậc điện đã dùng cộng các dòng VAT/phí, không chỉ một tổng duy
        nhất.
15. [ ] Xác nhận tổng hợp pháp (`calculatedTotal`) hiển thị khớp với
        tổng cộng của các dòng breakdown (không có sai lệch/làm tròn
        âm thầm), số tiền thực thu hiển thị đúng `400000`, và
        `billingDifference` hiển thị đúng chiều (thực thu cao hơn hay
        thấp hơn tổng hợp pháp).
16. [ ] **Đọc lại hoá đơn vừa tạo (đúng luồng thật, KHÔNG có danh sách/
        lịch sử hoá đơn riêng):** trên cùng màn hình Hóa đơn, chọn lại
        đúng bất động sản, đúng phòng, và đúng tháng `2026-10` vừa
        dùng ở trên, sau đó bấm nút **"Xem hóa đơn đã lưu"**. Xác nhận
        breakdown, tổng hợp pháp, số tiền thực thu `400000`, và
        `billingDifference` hiển thị lại giống hệt (không có dấu hiệu
        tính toán lại — dữ liệu này được đọc thẳng từ database qua
        `GET /api/v1/invoices?roomId=...&billingPeriod=...`, không đi
        qua Calculation Core lần thứ hai).
17. [ ] Thu nhỏ trình duyệt về khung nhìn di động/hẹp (~375px) — xác
        nhận menu điều hướng responsive mở/đóng đúng và không vỡ layout.
18. [ ] Trong suốt bước 1–17, mở DevTools console của trình duyệt và
        xác nhận không có lỗi JS chưa bắt (uncaught) hay promise bị từ
        chối không xử lý (unhandled rejection) nào được ghi log.
19. [ ] Xác nhận mọi giá trị tài chính/đo lường hiển thị (chỉ số công
        tơ, giá biểu giá, số tiền hoá đơn) hiển thị dưới dạng chuỗi
        thập phân chính xác, không có dấu hiệu sai số dấu phẩy động
        (ví dụ không hiển thị kiểu `120.00000001`).

## Dữ liệu test để lại sau khi chạy

Ứng dụng **cố ý không có** endpoint/nút xoá (DELETE) cho bất kỳ tài
nguyên nào (property/room/meter reading/tariff/invoice) — xem
`docs/MANAGEMENT_API.md` mục "Không có endpoint DELETE (theo thiết
kế)". Vì vậy:

- **Không cần** dọn dẹp property/room/invoice vừa tạo qua giao diện —
  việc đó không thể thực hiện được vì không có tính năng xoá, và đây
  KHÔNG phải một bước bắt buộc của checklist này.
- Đặt tên rõ ràng cho các bản ghi test (ví dụ tiền tố `SMOKE_TEST_...`)
  để dễ nhận ra đây là dữ liệu smoke test, không phải dữ liệu thật.
- Việc để lại các bản ghi này trong database development/test là CHẤP
  NHẬN ĐƯỢC.
- Nếu cần dọn dẹp, có thể xoá trực tiếp trong database development/
  test (ví dụ qua Supabase SQL editor) sau khi smoke test xong — đây
  là một bước TUỲ CHỌN, không bắt buộc, và không cần thêm DELETE API
  chỉ để phục vụ việc dọn dẹp này.

## Sau khi chạy checklist này

Ghi lại kết quả (đạt/không đạt, và bất kỳ lỗi nào phát hiện được)
trước khi tiến hành bất kỳ bước merge/tag/release nào. Checklist này
tự nó KHÔNG cho phép merge vào `main`, tạo tag, hay tạo GitHub Release
— đó vẫn là các hành động riêng biệt, tường minh, cần được xác nhận
độc lập.
