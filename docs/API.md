# API

Tài liệu này là hợp đồng REST cho các endpoint hiện có. Nó bổ sung cho
`docs/CREATE_INVOICE_WORKFLOW.md` (logic Service đứng sau) và
`docs/ERROR_HANDLING.md` (hợp đồng thành công/lỗi chung).

Tài liệu này bao phủ các endpoint workflow hoá đơn
(`POST`/`GET /api/v1/invoices`). Các endpoint quản lý property/room/
meter-reading/tariff được ghi riêng trong `docs/MANAGEMENT_API.md` —
hai tài liệu dùng chung các quy ước (ID, hợp đồng chuỗi thập phân, hợp
đồng lỗi) mô tả bên dưới. API này chưa có xác thực — giao diện trình
duyệt bắt buộc (`docs/FRONTEND.md`) tiêu thụ API này, nhưng không có
kiểm soát truy cập nào.

## Base path

Mọi endpoint đều versioned dưới `/api/v1` (xem `backend/src/app.ts`).

## Quy ước dùng xuyên suốt

- **ID** (`roomId`, `id`, mọi field `...Id`): chuỗi chữ số thập phân,
  không bao giờ là số JSON — cột gốc là `BIGINT`, thứ mà một `number`
  của JS không thể biểu diễn an toàn đầy đủ (xem
  `docs/DATABASE_ACCESS.md` mục "Ranh giới `BIGINT` / ID").
- **Giá trị tài chính** (`calculatedTotal`, `actualChargedAmount`,
  `amount`, `unitPrice`, `quantity`, `billingDifference`, và mọi field
  số của Calculation Core): chuỗi thập phân, không bao giờ là số JSON.
  Một giá trị có thể trả về theo đúng scale đã khai báo của database
  (ví dụ `"366994.00"`, không phải `"366994"`) — đây là cùng một giá
  trị chính xác, không phải một lỗi độ chính xác, và API **không** định
  dạng lại nó cho đẹp (xem `docs/DATABASE_ACCESS.md` mục "Định dạng
  chuỗi NUMERIC không được chuẩn hoá"). Client không được chạy
  `Number(...)`/`parseFloat(...)` trên các field này cho bất cứ mục
  đích nào ngoài định dạng hiển thị chấp nhận được số 0 ở cuối.
- **Định dạng `billingPeriod` trên wire**: `"YYYY-MM-DD"` (ví dụ
  `"2026-09-01"`), luôn là ngày đầu tiên của một tháng. Không bao giờ
  là một timestamp ISO-8601 đầy đủ trên wire — xem "Hợp đồng ngày" bên
  dưới.
- **`createdAt`**: một chuỗi timestamp ISO-8601 đầy đủ (ví dụ
  `"2026-09-10T12:34:56.000Z"`).
- **Hợp đồng thành công**: `{ "success": true, "data": ... }`.
- **Hợp đồng lỗi**: `{ "success": false, "error": { "code": "...", "message": "..." } }`
  — xem `docs/ERROR_HANDLING.md`. `message` không bao giờ là một lỗi
  PostgreSQL thô, tên ràng buộc, văn bản SQL, hay stack trace.

## Hợp đồng ngày

`billingPeriod` trên wire **luôn luôn** là `"YYYY-MM-DD"` — không bao
giờ là một timestamp đầy đủ, không bao giờ là một chuỗi ngày tuỳ ý mà
JS parse được. Controller (`backend/src/modules/invoice/invoice.http.ts`,
`parseBillingPeriodWireFormat`) ép buộc, theo thứ tự:

1. Giá trị là một chuỗi.
2. Khớp chính xác `^\d{4}-\d{2}-\d{2}$`.
3. Là một ngày lịch thật (`"2026-02-30"` bị từ chối — nếu không, `Date`
   của JS sẽ âm thầm cuộn nó sang tháng Ba thay vì báo lỗi).
4. Ngày của nó là `01` — một kỳ billing luôn là ngày đầu tiên của
   tháng, khớp ràng buộc `CHECK (EXTRACT(DAY FROM billing_period) = 1)`
   của migration 001.

Một giá trị hợp lệ được parse thành một `Date` tại UTC-midnight
(`"2026-09-01"` → `2026-09-01T00:00:00.000Z`), khớp hợp đồng sẵn có của
`CreateInvoiceService`/`GetInvoiceService`. Bất kỳ thất bại nào trả về
`400 VALIDATION_ERROR` — ví dụ bị từ chối:
`"2026-9-1"`, `"2026-09-02"` (không phải ngày đầu tháng),
`"2026-02-30"` (không phải ngày thật), `"2026-09-01T10:00:00Z"` (có
thành phần giờ).

Đây chỉ là một quyết định ở **định dạng wire** — nó không thay đổi
ranh giới `Date` của Repository/domain đã được review (và cố ý giữ
nguyên) trong `docs/DATABASE_ACCESS.md` mục "Ranh giới `DATE`".

## `POST /api/v1/invoices`

Tạo một hoá đơn mới cho một room/kỳ billing, chạy toàn bộ workflow
`CreateInvoiceService` (xem `docs/CREATE_INVOICE_WORKFLOW.md`).

### Request body

```json
{
  "roomId": "1",
  "billingPeriod": "2026-09-01",
  "electricityBillingMethod": "QUOTA_TIERED",
  "waterBillingMethod": "PER_CUBIC_METER",
  "actualChargedAmount": null
}
```

| Field | Kiểu | Ghi chú |
|---|---|---|
| `roomId` | string | Bắt buộc. Chuỗi thập phân dương hình dạng `BIGINT`. |
| `billingPeriod` | string | Bắt buộc. `"YYYY-MM-DD"`, ngày đầu tháng — xem "Hợp đồng ngày". |
| `electricityBillingMethod` | string | Bắt buộc. `"QUOTA_TIERED"` \| `"FALLBACK_TIER_FLAT"`. |
| `waterBillingMethod` | string | Bắt buộc. `"PER_CUBIC_METER"` \| `"PER_PERSON"`. |
| `actualChargedAmount` | string \| null | Tuỳ chọn (mặc định `null`). Xem "Sửa lỗi scale actualChargedAmount" bên dưới. |

Controller chỉ kiểm tra các field này *có mặt và đúng kiểu JS* (string
/ string-hoặc-null) và parse `billingPeriod`; nó **không** kiểm tra
`roomId` có đúng hình dạng BIGINT hay các phương pháp có phải giá trị
enum hợp lệ — đó là việc của `CreateInvoiceService` (cả hai đều trả
`VALIDATION_ERROR`), giữ validate nghiệp vụ ngoài Controller.

### Sửa lỗi scale `actualChargedAmount`

`invoices.actual_charged_amount` là `NUMERIC(14, 2)`. Trước bản sửa
này, `CreateInvoiceService` từng chấp nhận bất kỳ số thập phân chính
xác tuỳ ý nào (ví dụ `"367000.123456"`), tính `billingDifference` từ
giá trị đầy đủ, rồi để PostgreSQL âm thầm làm tròn nó thành
`"367000.12"` khi ghi — khiến `billingDifference` trả về và
`actualChargedAmount` đã lưu mô tả hai giá trị nguồn khác nhau. Điều
này nay bị từ chối **trước bất kỳ Repository read nào**:

- Phải là một chuỗi thập phân không âm.
- Tối đa 12 chữ số nguyên, tối đa 2 chữ số thập phân (để luôn vừa đúng
  `NUMERIC(14, 2)` mà không cần làm tròn).
- Không bao giờ parse qua `Number(...)`/`parseFloat(...)` — chỉ kiểm
  tra hình dạng (regex)
  (`backend/src/modules/invoice/invoice-input-validation.ts`,
  `isValidActualChargedAmountScale`).

| Giá trị | Kết quả |
|---|---|
| `"0"`, `"480000"`, `"480000.5"`, `"480000.50"`, `"999999999999.99"` | hợp lệ |
| `"-1"`, `"12.345"`, `"367000.123456"`, `"1000000000000"`, `"abc"`, `""` | `400 VALIDATION_ERROR` |

### Response thành công — `201 Created`

```json
{
  "success": true,
  "data": {
    "invoice": {
      "id": "42",
      "roomId": "1",
      "billingPeriod": "2026-09-01",
      "tenantCountUsed": 4,
      "electricityTariffId": "10",
      "waterTariffId": "20",
      "electricityBillingMethod": "QUOTA_TIERED",
      "waterBillingMethod": "PER_CUBIC_METER",
      "electricityReadingId": "200",
      "waterReadingId": "300",
      "calculatedTotal": "366994.00",
      "actualChargedAmount": "367000.12",
      "createdAt": "2026-09-10T12:34:56.000Z"
    },
    "items": [
      { "id": "1", "invoiceId": "42", "category": "ELECTRICITY_TIER", "tierNumber": 1, "quantity": "50", "unitName": "kWh", "unitPrice": "1984.00", "amount": "99200", "description": "Bậc điện 1", "displayOrder": 1 }
    ],
    "electricity": { "method": "QUOTA_TIERED", "result": { "usageKwh": "120", "...": "..." } },
    "water": { "method": "PER_CUBIC_METER", "...": "..." },
    "invoiceTotal": { "exactTotal": "366994", "roundedTotalVnd": "366994" },
    "billingDifference": "6.12"
  }
}
```

`electricity`/`water`/`invoiceTotal` là các object kết quả đầy đủ của
Calculation Core (`backend/src/calculation/types/calculation.types.ts`)
trả về nguyên văn — mọi field đã là `string`/`number`, không có `Date`
hay `bigint`, nên không cần bước serialize riêng nào cho chúng.

## `GET /api/v1/invoices`

Đọc lại một hoá đơn **đã lưu, thuộc lịch sử** — nó **không** tính lại
tiền điện/nước. Xem `docs/CREATE_INVOICE_WORKFLOW.md` mục "Snapshot
của room" để biết vì sao một hoá đơn lịch sử không bao giờ được âm
thầm thay đổi khi cấu hình tariff/số người ở hiện tại thay đổi.

### Query parameters

| Tham số | Kiểu | Ghi chú |
|---|---|---|
| `roomId` | string | Bắt buộc. |
| `billingPeriod` | string | Bắt buộc. `"YYYY-MM-DD"` — cùng quy tắc như POST. |

```
GET /api/v1/invoices?roomId=1&billingPeriod=2026-09-01
```

### Response thành công — `200 OK`

```json
{
  "success": true,
  "data": {
    "invoice": { "...": "cùng hình dạng invoice của POST" },
    "items": [ "...": "cùng hình dạng items của POST, ORDER BY display_order ASC" ],
    "billingDifference": "6.12"
  }
}
```

`billingDifference` được tính theo yêu cầu từ hai giá trị đã lưu
(`invoice.calculatedTotal`, `invoice.actualChargedAmount`) — nó
**không** được lưu trữ, và là `null` khi `actualChargedAmount` là
`null`.

## Response lỗi

```json
{ "success": false, "error": { "code": "ROOM_NOT_FOUND", "message": "Không tìm thấy room với id = 1." } }
```

### Ánh xạ HTTP status

Một bảng nhỏ, tường minh, nay dùng chung bởi mọi module HTTP trong
backend (`backend/src/shared/http/result-error-status.ts`,
`mapResultErrorCodeToHttpStatus` — file `invoice.http.ts` của chính
module invoice re-export nó nguyên vẹn để các import sẵn có vẫn hoạt
động) — không phải một framework lỗi tổng quát. Bất kỳ mã lỗi `Result`
nào không có trong bảng này ánh xạ thành `500` (không bao giờ đoán mò
thành 4xx cho một tình huống không nhận diện được).

| Status | Mã lỗi |
|---|---|
| `400` | `VALIDATION_ERROR`, `INVALID_ACTUAL_CHARGED_AMOUNT` |
| `404` | `ROOM_NOT_FOUND`, `METER_READING_NOT_FOUND`, `TARIFF_NOT_FOUND`, `INVOICE_NOT_FOUND`, `PROPERTY_NOT_FOUND` |
| `409` | `INVOICE_ALREADY_EXISTS`, `ROOM_ALREADY_EXISTS`, `METER_READING_ALREADY_EXISTS`, `METER_READING_IN_USE`, `TARIFF_ALREADY_EXISTS`, `TARIFF_PERIOD_OVERLAP`, `TARIFF_IN_USE` |
| `422` | `AMBIGUOUS_TARIFF_CONFIGURATION`, `TARIFF_CONFIGURATION_INVALID`, `INVALID_QUOTA`, `INVALID_TENANT_COUNT`, `INVALID_PEOPLE_PER_QUOTA_UNIT`, `INVALID_METER_READING`, `INVALID_METER_MAXIMUM`, `METER_MAXIMUM_REQUIRED`, `FALLBACK_TIER_NOT_FOUND`, `INVALID_WATER_METHOD`, `INVALID_WATER_RATE`, `INVALID_VAT_RATE`, `INVALID_DECIMAL`, và các mã cấu trúc tier của `validateElectricityConfig` (`EMPTY_TARIFF`, `INVALID_TIER_NUMBER`, `DUPLICATE_TIER_NUMBER`, `INVALID_TIER_PRICE`, `INVALID_TIER_THRESHOLD`, `NO_UNLIMITED_TIER`, `MULTIPLE_UNLIMITED_TIERS`, `UNLIMITED_TIER_NOT_LAST`) |
| `500` | `DATABASE_READ_FAILED`, `DATABASE_WRITE_FAILED`, `TRANSACTION_FAILED`, `INTERNAL_INVARIANT_VIOLATION`, `INTERNAL_ERROR` (throw bất ngờ bị bắt tại ranh giới Controller), và bất kỳ mã không nhận diện được nào |

Các mã `404`/`409`/`422` thêm ở hàng này (`PROPERTY_NOT_FOUND`,
`ROOM_ALREADY_EXISTS`, `METER_READING_ALREADY_EXISTS`,
`METER_READING_IN_USE`, `TARIFF_ALREADY_EXISTS`,
`TARIFF_PERIOD_OVERLAP`, `TARIFF_IN_USE`, `INVALID_PEOPLE_PER_QUOTA_UNIT`,
và các mã cấu trúc tier) chỉ có thể xảy ra qua các endpoint quản lý —
xem `docs/MANAGEMENT_API.md`.

`409 INVOICE_ALREADY_EXISTS` bao phủ cả trường hợp bình thường
(pre-check của chính Service) lẫn trường hợp race condition (một
`SQLSTATE 23505` thật được `PostgresInvoiceRepository.createInvoice`
dịch lại) — xem `docs/CREATE_INVOICE_WORKFLOW.md` mục "Hoá đơn trùng
lặp / race condition".

### Những gì không bao giờ được gửi cho client

Văn bản SQL, tên ràng buộc PostgreSQL, `DATABASE_URL` hay bất kỳ chi
tiết kết nối nào, stack trace. Một exception bất ngờ (không phải
`Result`) tới được Controller bị bắt và chuyển thành một
`500 { "code": "INTERNAL_ERROR" }` chung — lỗi thật chỉ được log phía
server (`console.error`), không bao giờ serialize vào response.

## Ghi chú không lộ SQL / bảo mật

- `express.json()` parse request body; không có middleware parse body
  nào khác được thêm vào.
- Mọi giá trị chạm tới SQL đều được Postgres.js tham số hoá (`${value}`
  trong một tagged template) — tầng Controller/Service không bao giờ
  thấy hay tự dựng SQL (`SQL_IN_CONTROLLER=0`, `SQL_IN_SERVICE=0` — xem
  kiểm chứng của task đã đưa tầng này vào).
- Cả `invoice.controller.ts` lẫn `create-invoice.service.ts`/
  `get-invoice.service.ts` đều không import Postgres.js hay
  `DatabaseExecutor` — chỉ
  `backend/src/composition/invoice.composition.ts` (composition root)
  và các file `postgres/postgres-*.repository.ts` mới làm điều đó.

## Nối composition / dependency

`backend/src/composition/invoice.composition.ts` là nơi DUY NHẤT dựng
`CreateInvoiceService`/`GetInvoiceService` thật (chạy trên Postgres).
Nó **lazy**: `getDatabaseClient()` chỉ được gọi bên trong mỗi hàm
factory, và mỗi hàm factory chỉ được gọi *sau khi* Controller đã
validate xong request — không bao giờ tại thời điểm import module.
Điều này có nghĩa:

- Import `app.ts` (thứ mount `invoice.routes.ts`, thứ import module
  composition) không bao giờ chạm database.
- `GET /api/v1/health` vẫn hoạt động kể cả khi chưa đặt `DATABASE_URL`.
- Một request `POST`/`GET /api/v1/invoices` sai định dạng (hình dạng
  JSON sai, `billingPeriod` sai) vẫn trả về đúng `400`, không phải
  `500`, kể cả khi chưa cấu hình `DATABASE_URL` — vì validate chạy
  trước khi Service được dựng.
- Chỉ request thực sự cần đọc/ghi database (hình dạng hợp lệ, tới được
  `service.execute(...)`) mới phụ thuộc `DATABASE_URL` đã được cấu
  hình; nếu chưa, request đó nhận `500` (không phải crash).

## Những gì chưa được cài đặt

DELETE cho bất kỳ tài nguyên nào (theo thiết kế — xem
`docs/MANAGEMENT_API.md` mục "Không có endpoint DELETE"), xác thực,
phân quyền theo vai trò, và một khu vực quản trị/người dùng riêng có
kiểm soát quyền. Quản lý Property/Room/MeterReading/Tariff (list/
create/update) **đã** được cài đặt — xem `docs/MANAGEMENT_API.md` —
và một giao diện trình duyệt bắt buộc đầy đủ nay tiêu thụ API này từ
đầu đến cuối, bao gồm cả cấu hình tariff — xem `docs/FRONTEND.md`.
