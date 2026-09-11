# Frontend

Tài liệu này giải thích ứng dụng trình duyệt — kiến trúc, sơ đồ màn
hình, ranh giới API-client, và các quy tắc chính xác không bao giờ
được vi phạm khi hiển thị tiền. Tài liệu bổ sung cho `docs/API.md` và
`docs/MANAGEMENT_API.md` (hợp đồng REST mà UI này tiêu thụ) và
`docs/ARCHITECTURE.md` (cùng nguyên tắc phân tầng áp dụng ở phía
backend).

**Chưa có triển khai production nào.** Tài liệu này mô tả cách chạy
ứng dụng tại máy local (`npm run dev` trong `backend/` và `frontend/`)
— không có gì ở đây tuyên bố một instance đã host, truy cập công khai
được.

## Công nghệ (đã khoá)

Vite + TypeScript + HTML5 + Bootstrap (chỉ CSS) + CSS tự viết. Không
framework (React/Vue/Angular/Svelte), không thư viện router, không thư
viện quản lý state, không thư viện chart/form.
`frontend/package.json` có đúng hai dependency runtime/dev: `bootstrap`
và `typescript`/`vite` — không đổi qua công việc này.

## Kiến trúc

```
main.ts
   ↓
controllers/  ← điều phối một màn hình: gọi api/, rồi views/
   ↓        ↓
api/       views/
   ↓
backend REST API (/api/v1/...)
```

Cùng nguyên tắc tách biệt `Route → Controller → api → View` như
`Route → Controller → Service → Repository` của backend
(`docs/ARCHITECTURE.md`) — `api/*.api.ts` là tương đương phía frontend
của một Repository (cô lập `fetch`), `controllers/*.controller.ts` là
tương đương của một Service (điều phối, không có chi tiết DOM/HTTP),
`views/*.view.ts` là tương đương của việc định hình response của một
Controller (render DOM, không quyết định nghiệp vụ).

```
frontend/src/
  api/            Một hàm cho mỗi thao tác REST, wrapper mỏng bọc
                  quanh apiRequest<T>() của api-client.ts.
  types/          Type mirror đúng hợp đồng wire của backend
                  (quy ước docs/API.md: ID là string, giá trị tài
                  chính là string, ngày dạng "YYYY-MM-DD").
  utils/          Hàm thuần — escape HTML, định dạng hiển thị VND,
                  chuyển đổi month↔billingPeriod, phân loại dấu của
                  billingDifference, nhãn tiếng Việt cho enum. Không
                  DOM, không fetch.
  controllers/    Một cho mỗi màn hình — điều phối lời gọi api/ và cập
                  nhật view, giữ lượng state trong bộ nhớ nhỏ của màn
                  hình đó (ví dụ property/room nào đang được chọn, bản
                  ghi nào đang được sửa).
  views/          Render DOM. Không bao giờ gọi fetch, không bao giờ
                  quyết định *khi nào* làm gì — chỉ *cách* hiển thị nó.
  main.ts         File "nối dây" duy nhất: dựng khung ứng dụng, đăng
                  ký route, khởi động router, kích hoạt health check
                  backend.
```

Hàm controller của mỗi màn hình là một hàm async thuần, đặt tên tường
minh (`renderDashboardPage`, `renderPropertyManagementPage`,
`renderRoomManagementPage`, `renderMeterReadingManagementPage`,
`renderInvoiceManagementPage`, `renderTariffManagementPage`) — không
phải một hệ thống "component" tổng quát. Mỗi hàm render lại toàn bộ
markup của màn hình vào `#app-content` mỗi lần ghé thăm, rồi gắn lại
event listener vào các element vừa tạo; không có cây component bền
vững nào cần đối chiếu (reconcile), nên không có rủi ro listener cũ/
trùng lặp qua các lần điều hướng.

## Điều hướng — dựa trên hash, không dùng thư viện router

`controllers/navigation.controller.ts` là một **router rất nhỏ** — một
danh sách tĩnh các mục `{ hash, label, render }` và một listener
`hashchange`. Không có tham số path động, không có route lồng nhau,
không dùng History API ngoài những gì `location.hash` đã cung cấp sẵn.

| Hash | Màn hình |
|---|---|
| `#/dashboard` | Tổng quan |
| `#/properties` | Cơ sở |
| `#/rooms` | Phòng |
| `#/readings` | Ghi chỉ số |
| `#/invoices` | Hóa đơn (cũng chứa "Đối chiếu" — so sánh thực thu-hợp pháp — trong cùng màn hình, theo phương án đơn giản hơn trong hai lựa chọn được phép) |
| `#/tariffs` | Biểu giá (hai tab: Điện / Nước) |

Ghé thăm một hash không xác định hoặc rỗng quay về `#/dashboard`. Mỗi
màn hình tự quản lý state lựa chọn của nó (property/room/tariff đang
được chọn/sửa) trong biến ở phạm vi module bên trong controller của nó
— không phải trong URL — điều này đủ dùng cho phạm vi này và giữ cho
router thực sự nhỏ gọn.

## Ranh giới API client

`api/api-client.ts` export một hàm, `apiRequest<T>(path, options)`,
được mọi module `api/*.api.ts` dùng. Nó:

- Luôn gọi một đường dẫn **tương đối** (`/api/v1/...`) — không bao giờ
  `http://localhost:3000` hay bất kỳ origin hard-code nào khác. Ở môi
  trường dev, Vite proxy `/api` tới backend (`vite.config.ts`); một
  bản build production sẽ được phục vụ từ cùng origin với API. Đây là
  lý do `NO_HARDCODED_API_ORIGIN` đúng trên toàn bộ codebase.
- Parse response body theo đúng hợp đồng `{ success, data }` /
  `{ success: false, error: { code, message } }` của chính backend bất
  kể HTTP status — backend luôn trả về hình dạng đó, nên không có gì
  thêm cần diễn giải.
- Không bao giờ throw. Một lỗi mạng (backend không gọi được, body
  không phải JSON) trở thành
  `{ success: false, error: { code: "NETWORK_ERROR", message: "..." } }`
  — một message an toàn, do frontend tự viết, không bao giờ để một
  exception thô hay stack trace tới được UI.

Mọi màn hình hiển thị `result.error.message` (message tiếng Việt của
chính backend) qua `showGlobalAlert` của `views/shared.view.ts`, hàm
này đặt nó qua `textContent` — không bao giờ diễn giải lại hay thay
bằng một chuỗi "đã có lỗi xảy ra" chung, ngoại trừ đúng một trường hợp
đã ghi rõ (`TARIFF_IN_USE`, xem "Màn hình biểu giá" bên dưới), nơi một
message hành động rõ ràng hơn được hiển thị thay cho văn bản gốc của
backend.

## Quy tắc chuỗi tài chính (quan trọng)

**Frontend không bao giờ tự tính tiền hoá đơn.** Nó chỉ gửi giá trị
người dùng đã nhập, hiển thị giá trị backend đã tính sẵn, và hiển thị
so sánh (`billingDifference`) backend đã suy ra sẵn. Mọi type trong
`types/*.types.ts` mô hình hoá một field tài chính/đo lường
(`previousReading`, `currentReading`, `meterMaximumValue`,
`electricityVatRate`, `unitPrice`, `pricePerCubicMeter`, `vatRate`,
`environmentalFeeRate`, `amount`, `calculatedTotal`,
`actualChargedAmount`, `billingDifference`, ...) dưới dạng `string` —
không bao giờ `number`. `Number(...)`/`parseFloat(...)`/
`Math.round(...)` không bao giờ được áp dụng cho bất kỳ field nào
trong số này ở bất kỳ đâu trong codebase (đã kiểm chứng bằng grep — xem
báo cáo cuối).

### Field số nguyên và field thập phân tài chính

Một ngoại lệ có chủ đích: `tenantCount`, `tierNumber`,
`peoplePerQuotaUnit`, và `fallbackTierNumber` được mô hình hoá dưới
dạng `number` và đọc qua `input.valueAsNumber`/`Number(select.value)`
sau một kiểm tra số nguyên (`Number.isInteger(...)`). Đây là các cột
`INTEGER` của backend — số đếm thuần, không phải giá trị tài chính
`NUMERIC` — nên không có độ chính xác nào để mất. Sự phân biệt này được
ghi rõ trực tiếp trong các file `types/*.types.ts` liên quan, không
chỉ ở đây.

### Định dạng VND chỉ để hiển thị

`formatVndDisplay(value: string): string` của `utils/format.ts` nhóm
hàng nghìn bằng `.` và giữ phần thập phân khác 0 sau `,` (quy ước Việt
Nam) — hoàn toàn bằng thao tác **chuỗi** (tách tại `"."`, đảo/nhóm các
ký tự số, ghép lại). Nó không bao giờ chuyển đổi qua `Number`. Ví dụ:

```
"210756"    → "210.756 ₫"
"366994.00" → "366.994 ₫"   (phần thập phân toàn số 0 bị bỏ)
"6.12"      → "6,12 ₫"      (phần thập phân khác 0 được giữ, không cắt)
```

Chuỗi API gốc không bao giờ bị thay đổi — chỉ một chuỗi hiển thị riêng
được suy ra từ nó.

### Phân loại dấu của `billingDifference`

`classifyBillingDifference(value: string)` của `utils/format.ts` trả về
`"over" | "under" | "exact"` chỉ bằng cách kiểm tra **hình dạng chuỗi**
— `value.startsWith("-")` cho âm, một regex (`/^0+(\.0+)?$/`) cho đúng
bằng 0, mọi trường hợp khác là dương. Nó không bao giờ parse giá trị để
so sánh số học với `0`. Màn hình hoá đơn ánh xạ điều này thành các nhãn
bắt buộc: over → "Thu cao hơn mức tính hợp pháp", under → "Thu thấp
hơn mức tính hợp pháp", exact → "Khớp".

### Chuyển đổi Month ↔ `billingPeriod`

`<input type="month">` trả về `"YYYY-MM"`; định dạng wire cần
`"YYYY-MM-DD"`. `monthInputToBillingPeriod`/`billingPeriodToMonthInput`
của `utils/format.ts` làm điều này chỉ bằng **cắt/ghép chuỗi**
(`` `${monthValue}-01` ``, `billingPeriod.slice(0, 7)`) — không object
`Date` nào được dựng, nên không có rủi ro timezone local ở ranh giới
này (xem `docs/API.md` mục "Hợp đồng ngày" để biết vì sao chính backend
cũng khăng khăng như vậy).

Tariff `effectiveFrom`/`effectiveTo` dùng `<input type="date">` thuần
thay vào đó (một ngày lịch thật được kỳ vọng, không phải một tháng
billing, và ngày **không** bị ép về `01` — `effectiveFrom` thật của
tariff điện seed mặc định là `2025-05-10`, xem
`docs/MANAGEMENT_API.md` mục "Ngày hiệu lực tariff"). Giá trị `<input
type="date">` (đã là `"YYYY-MM-DD"`) được gửi tới API nguyên vẹn.

## Escape HTML

`escapeHtml(value: string): string` của `utils/format.ts` escape
`& < > " '`. Mọi hàm `views/*.view.ts` dựng một chuỗi HTML qua template
literal đều bọc **mọi** field text nội suy có nguồn gốc từ người dùng/
API (tên property/room/tariff, địa chỉ, mô tả invoice item, ...) trong
`escapeHtml(...)` trước khi nội suy nó — đã kiểm chứng như một phần của
audit task này (grep tìm nội suy `${...}` chưa escape trong mọi file
view, đối chiếu chéo với nguồn gốc của từng field). Số thuần
(`tenantCount`, `tierNumber`, ...) được chèn không escape vì một
`number` JS không thể chứa ký tự đặc biệt HTML. `showGlobalAlert` (nơi
DUY NHẤT mọi message lỗi backend tới DOM) đi xa hơn một bước và dùng
`textContent`, không bao giờ dùng `innerHTML` — lựa chọn an toàn nhất,
dùng ở bất cứ đâu nội dung là một message tự do đơn lẻ thay vì một đoạn
có cấu trúc lớn hơn.

## Màn hình hoá đơn — màn hình demo chính

`#/invoices` là một màn hình bao phủ toàn bộ trung tâm của workflow bắt
buộc:

1. **Tạo**: chọn property → room (tải qua `GET /api/v1/rooms?propertyId=`)
   → tháng billing → phương pháp điện (nhãn `"Theo định mức số người /
   bậc thang"` cho `QUOTA_TIERED`, `"Chưa kê khai — toàn bộ sản lượng
   theo bậc fallback"` cho `FALLBACK_TIER_FLAT` — bản thân `<option
   value="...">` vẫn giữ đúng giá trị enum API thật; chỉ nhãn hiển thị
   là tiếng Việt) → phương pháp nước (`"Theo m³"` / `"Theo số người"`)
   → ô nhập số tiền thực thu tuỳ chọn. `POST /api/v1/invoices`; một ô
   thực thu để trống gửi `null`, **không bao giờ** gửi chuỗi rỗng.
2. **Xử lý trùng lặp**: một response `409 INVOICE_ALREADY_EXISTS` thay
   vùng kết quả bằng một gợi ý — "Hóa đơn đã tồn tại — tải hóa đơn đã
   lưu" — nối tới cùng đường đọc lại như (3).
3. **Đọc lại đã có**: một nút "Xem hóa đơn đã lưu" gọi
   `GET /api/v1/invoices?roomId=...&billingPeriod=...` cho room/tháng
   đang được chọn — đây là một **thao tác đọc lại thuần**, Service phía
   backend không tính lại gì cả, và màn hình này cũng vậy.
4. **Render kết quả**: một bản tóm tắt (room, kỳ billing, số người ở đã
   dùng, cả hai phương pháp), một bảng breakdown dựng trực tiếp từ
   `items[]` (`item.amount` dùng nguyên văn — không bao giờ dựng lại từ
   `quantity × unitPrice` trong trình duyệt), và tổng hợp pháp
   (`invoice.calculatedTotal`) hiển thị nổi bật.
5. **So sánh**: khi `billingDifference` khác `null`, một card riêng
   hiển thị số tiền thực thu, tổng hợp pháp, chênh lệch, và một badge
   trạng thái (xem "Phân loại dấu của `billingDifference`" ở trên).

Theo `docs/CREATE_INVOICE_WORKFLOW.md`, `actualChargedAmount` chỉ có
thể được cung cấp **tại thời điểm tạo** — không có endpoint nào để gắn
nó vào một hoá đơn đã tạo sau đó. Để thử luồng so sánh, hãy cung cấp nó
trong cùng `POST` tạo hoá đơn cho một room/kỳ nhất định, không phải như
một hành động tiếp theo trên một hoá đơn đã có.

## Trình soạn tier biểu giá điện động

Form biểu giá điện (`#/tariffs`, tab "Điện") không bao giờ giả định một
số lượng tier cố định. `controllers/tariff.controller.ts` giữ các dòng
tier dưới dạng **element DOM**, không phải một mảng JS song song —
"Thêm bậc"/"Xóa" thêm/xoá element `[data-tier-row]` trực tiếp;
`collectTierRows()` đọc lại trạng thái DOM hiện tại thành
`ElectricityTariffTierInput[]` chỉ khi form được submit.

Hai định danh cố ý được giữ **tách biệt** cho mỗi dòng:

- **Số tier** hiển thị (`.app-tier-number`, text input bị disable) —
  tính lại tuần tự sau mỗi lần thêm/xoá (`renumberTierRows`), thuần để
  hiển thị và để gửi lên API.
- Một **id dòng** (một bộ đếm tăng dần, `nextTierRowId`, không bao giờ
  dùng lại kể cả sau khi một dòng bị xoá) — chỉ dùng cho cặp
  `id`/`for` của checkbox "không giới hạn", để hai dòng không bao giờ
  bị trùng `id` DOM sau một chuỗi thêm-sau-khi-xoá (một bug thật đã
  được phát hiện và sửa trong quá trình tự audit thủ công của task này
  — xem "Những gì thực sự đã được test runtime" bên dưới).

Chỉ dòng cuối cùng được kỳ vọng là tier không giới hạn
(`thresholdKwh = null`), biểu diễn bằng một checkbox "Bậc cuối / không
giới hạn" vô hiệu hoá và xoá trống field ngưỡng của dòng đó khi được
tick. Field `fallbackTierNumber` là một `<select>` được điền từ các
dòng tier hiện tại (`refreshFallbackTierOptions`), nên người quản lý
chỉ có thể chọn một số tier thực sự tồn tại trong form ngay lúc đó —
dù backend vẫn là nơi validate có thẩm quyền cho toàn bộ quy tắc cấu
trúc tier (`docs/MANAGEMENT_API.md` mục "Validate tỷ lệ / định mức /
tier fallback").

## Màn hình biểu giá — `TARIFF_IN_USE`

Khi một `PUT` tới endpoint tariff nào đó thất bại với `TARIFF_IN_USE`,
UI hiển thị một message cụ thể, hành động rõ ràng hơn thay cho văn bản
gốc của backend: *"Biểu giá này đã được dùng trong hóa đơn lịch sử. Hãy
tạo phiên bản biểu giá mới."* Không có lối tắt nào được cung cấp — hành
động đúng luôn là tạo một phiên bản tariff mới.

## Màn hình ghi chỉ số công tơ

Luồng chọn: property → room (kích hoạt form và tải lịch sử) → bộ lọc
tháng tuỳ chọn. `previousReading`/`currentReading`/`meterMaximumValue`
là các field `inputmode="decimal"` dạng text tự do (không bao giờ dùng
`<input type="number">`, thứ có thể khiến trình duyệt âm thầm làm tròn
hay từ chối các chuỗi thập phân lớn hợp lệ) chỉ với một kiểm tra hình
dạng tối thiểu phía client (`/^\d+(\.\d+)?$/`) — validate thật sự
(không âm, `meterMaximumValue` dương, quy tắc rollover) hoàn toàn thuộc
về `calculateMeterUsage` của backend, dùng lại nguyên vẹn; UI không cài
đặt lại bất kỳ phần nào của nó. Một response `409 METER_READING_IN_USE`
(sửa một reading đã được một hoá đơn lịch sử tham chiếu) được hiển thị
với đúng message của backend, không có lối vượt qua nào.

## Khung ứng dụng

`views/layout.view.ts` dựng toàn bộ khung một lần vào `<div id="app">`
(markup duy nhất mà chính `index.html` chứa) — điều hướng sidebar,
tiêu đề trang, một vùng alert toàn cục (`#app-alert-region`,
`aria-live="polite"`), badge trạng thái backend, và điểm mount
`#app-content` nơi mọi màn hình render vào. Sidebar thu gọn thành một
panel trượt vào bên dưới breakpoint `lg`, bật/tắt bằng một nút text
thuần "Điều hướng" (không icon font, không emoji) — không có JavaScript của
Bootstrap nào được load; nút bật/tắt và nút đóng alert được nối bằng
`addEventListener` thuần.

## Trạng thái backend

`GET /api/v1/health` vẫn được kiểm tra khi khởi động
(`controllers/status.controller.ts`, không đổi), nay render vào footer
sidebar thay vì một section trang riêng. Một health check thất bại chỉ
cập nhật đúng badge đó — nó không bao giờ chặn khung ứng dụng render
hay router hoạt động, theo đúng quy tắc sẵn có của dự án rằng health
check chỉ mang tính thông tin, không phải một cổng khởi động.

## Những gì thực sự đã được test runtime

**Không có công cụ trình duyệt nào khả dụng khi frontend này được xây
dựng ban đầu** — không có click-through, kiểm tra DOM, hay xác minh
console-log nào xảy ra trong một trình duyệt thật tại thời điểm đó.
Những gì *đã* được kiểm chứng lúc đó:

- `npm run typecheck` và `npm run build` (cả `tsc --noEmit` lẫn build
  production đầy đủ của Vite) — sạch, không lỗi.
- Backend được khởi động tại local không có `DATABASE_URL`, và proxy
  `/api` của Vite dev server được thử với request HTTP thật (`curl`) —
  xác nhận `GET /api/v1/health` thành công và các endpoint quản lý trả
  đúng `500 INTERNAL_ERROR` an toàn (chưa cấu hình database) thay vì
  crash, đúng như thiết kế. Mỗi module controller/view/util cũng được
  request riêng lẻ từ dev server, xác nhận mỗi module transpile không
  lỗi cú pháp (dev server của Vite trả về một overlay lỗi compile thay
  vì module khi thất bại thật — không có module nào như vậy).
- Một lượt trace thủ công/tĩnh cẩn thận qua logic controller của mỗi
  màn hình, đối chiếu với đúng các kịch bản trong "Manual/static smoke
  audit" (hướng dẫn của task đó) — đây là cách bug `id` trùng lặp trong
  trình soạn tier (xem ở trên) thực sự được phát hiện và sửa, *trước
  khi* có bất kỳ tuyên bố đúng đắn nào được đưa ra.
- Kiểm chứng bằng grep: zero API origin hard-code, zero
  `parseFloat`/ép kiểu `Number()` tài chính (các lời gọi `Number()`/
  `valueAsNumber` duy nhất là trên field `INTEGER`), zero secret, zero
  React/Vue/Angular/Svelte trong `package.json`, mọi nội suy `${...}`
  trong mọi file view đều truy vết được về hoặc một nguồn số/hằng số an
  toàn hoặc một wrapper `escapeHtml(...)`.

**Kể từ đó, một lần chạy "runtime closure" riêng đã kiểm chứng bằng
thực thi thật (không phải trình duyệt, nhưng thật):** backend khởi động
với `DATABASE_URL` thật trỏ tới PostgreSQL thật, `GET /api/v1/health`
trả 200 qua chính origin của frontend; frontend dev server khởi động
thật và proxy `/api` của Vite thật sự chuyển tiếp request HTTP tới
backend thật (xác nhận qua `curl`, không phải trình duyệt); và toàn bộ
REST API bắt buộc mà UI này tiêu thụ (`docs/API.md`,
`docs/MANAGEMENT_API.md`) đã được kiểm chứng bằng 320/320 test PASS
chạy thật trên PostgreSQL thật, 0 SKIP. **Việc thực sự click-through
qua trình duyệt (mở app, điền form, xem kết quả bằng mắt, kiểm tra
console) vẫn còn đang CHỜ thực hiện thủ công** — xem
`docs/FINAL_SMOKE_CHECKLIST.md` cho checklist 15 bước cụ thể, và không
tài liệu nào trong dự án này được phép tuyên bố bước đó đã hoàn thành
cho tới khi việc đó được xác nhận.

## Chạy tại local

```bash
cd backend && npm install && npm run dev     # http://localhost:3000
cd frontend && npm install && npm run dev    # http://localhost:5173 (hoặc cổng trống kế tiếp)
```

Vite dev server proxy `/api/*` tới `http://localhost:3000`
(`vite.config.ts`, không đổi). Khi chưa đặt `DATABASE_URL`, badge
health vẫn chuyển xanh và mọi màn hình vẫn render — các lời gọi API
quản lý/hoá đơn trả về một `500` an toàn cho tới khi một database được
cấu hình (xem `backend/.env.example`, `docs/DEVELOPMENT.md`).
