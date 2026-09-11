# Checklist smoke test cuối cùng (thực hiện thủ công)

**Trạng thái: CHƯA được bất kỳ agent nào thực thi.** Phiên làm việc này
không có công cụ điều khiển trình duyệt nào được bật (Claude in Chrome
đã cài nhưng không bật cho phiên này), và không có Playwright/Cypress/
Selenium nào được thêm vào (việc thêm một công cụ như vậy nằm ngoài
phạm vi các task này). Mọi bằng chứng runtime KHÔNG liên quan trình
duyệt (PostgreSQL thật, transaction thật, đọc/ghi Repository thật, REST
API tạo/đọc hoá đơn thật, typecheck + build backend/frontend, health
endpoint, dev server backend/frontend cùng Vite proxy `/api`) đã được
chạy thật — xem báo cáo runtime closure để biết bằng chứng chi tiết.
**Chỉ riêng thao tác click-through trong trình duyệt bên dưới là chưa
được xác minh bởi agent.** Checklist này cần được thực hiện thủ công
trên trình duyệt và xác nhận kết quả trước khi coi giao diện trình
duyệt bắt buộc là sẵn sàng phát hành.

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
của session PowerShell trước khi chạy Node, ví dụ:

```powershell
Get-Content backend\.env | ForEach-Object {
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

## Checklist

1. [ ] Mở URL frontend trên trình duyệt. Khung ứng dụng và thanh điều
       hướng bên hiển thị, không có trang trắng.
2. [ ] Vào màn hình Bất động sản, tạo một bất động sản mới với tên và
       địa chỉ; nó xuất hiện ngay trong danh sách sau khi tạo.
3. [ ] Chọn bất động sản đó, tạo một phòng mới với `tenantCount = 4`;
       phòng xuất hiện dưới bất động sản tương ứng.
4. [ ] Chọn phòng đó. Nhập chỉ số công tơ điện cho một tháng test sạch:
       chỉ số cũ `0`, chỉ số mới `120`.
5. [ ] Nhập chỉ số công tơ nước cho cùng tháng đó: chỉ số cũ `0`, chỉ
       số mới `12`.
6. [ ] Mở màn hình cấu hình biểu giá điện — xác nhận biểu giá seed mặc
       định "Competition Default Electricity Tariff" (6 bậc) hiển thị
       đúng (VAT `0.0800`, số người/định mức `4`, bậc dự phòng `3`).
7. [ ] Mở màn hình cấu hình biểu giá nước — xác nhận biểu giá seed mặc
       định "Competition Default Water Tariff" hiển thị đúng giá/VAT/
       phí môi trường.
8. [ ] Vào màn hình Hóa đơn, tạo hoá đơn cho phòng/tháng đó với phương
       pháp `QUOTA_TIERED` (điện) + `PER_CUBIC_METER` (nước).
9. [ ] Xác nhận phần breakdown của hoá đơn hiển thị đủ dòng cho từng
       bậc điện đã dùng cộng các dòng VAT/phí, không chỉ một tổng duy
       nhất.
10. [ ] Xác nhận tổng hợp pháp hiển thị khớp với tổng cộng của các dòng
        breakdown (không có sai lệch/làm tròn âm thầm).
11. [ ] Nhập một số tiền thực thu khác với tổng hợp pháp (ví dụ cao/
        thấp hơn vài trăm đồng) và xác nhận ứng dụng hiển thị phần
        chênh lệch cùng bên nào cao hơn.
12. [ ] **Đọc lại hoá đơn vừa tạo (đúng luồng thật, KHÔNG có danh sách/
        lịch sử hoá đơn riêng):** trên cùng màn hình Hóa đơn, chọn lại
        đúng bất động sản, đúng phòng, và đúng tháng billing vừa dùng
        ở bước 8, sau đó bấm nút **"Xem hóa đơn đã lưu"**. Xác nhận
        breakdown hiển thị lại giống hệt (không có dấu hiệu tính toán
        lại — dữ liệu này được đọc thẳng từ database qua
        `GET /api/v1/invoices?roomId=...&billingPeriod=...`, không đi
        qua Calculation Core lần thứ hai).
13. [ ] Thu nhỏ trình duyệt về khung nhìn di động/hẹp (~375px) — xác
        nhận menu điều hướng responsive mở/đóng đúng và không vỡ layout.
14. [ ] Trong suốt bước 1–13, mở DevTools console của trình duyệt và
        xác nhận không có lỗi JS chưa bắt (uncaught) hay promise bị từ
        chối không xử lý (unhandled rejection) nào được ghi log.
15. [ ] Xác nhận mọi giá trị tài chính/đo lường hiển thị (chỉ số công
        tơ, giá biểu giá, số tiền hoá đơn) hiển thị dưới dạng chuỗi
        thập phân chính xác, không có dấu hiệu sai số dấu phẩy động
        (ví dụ không hiển thị kiểu `120.00000001`).

## Dữ liệu test để lại sau khi chạy

Ứng dụng **cố ý không có** endpoint/nút xoá (DELETE) cho bất kỳ tài
nguyên nào (property/room/meter reading/tariff/invoice) — xem
`docs/MANAGEMENT_API.md` mục "No DELETE endpoints". Vì vậy:

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
