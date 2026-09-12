# Management API

Tài liệu này là hợp đồng REST cho các endpoint quản lý của backend —
rental property, room, meter reading, và cấu hình tariff (điện + nước).
Nó bổ sung cho `docs/API.md` (các endpoint workflow hoá đơn và các quy
ước dùng chung: base path, hợp đồng ID/chuỗi thập phân, hợp đồng thành
công/lỗi) — hãy đọc tài liệu đó trước; tài liệu này chỉ bao phủ những gì
riêng cho quản lý.

Các endpoint này tồn tại để một frontend có thể tạo/sửa property và
room, đặt số người ở, nhập và xem chỉ số công tơ, và cấu hình tariff,
rồi gọi `POST`/`GET /api/v1/invoices` sẵn có. Giao diện trình duyệt
(`docs/FRONTEND.md`) nay tiêu thụ toàn bộ các endpoint này.

## Các endpoint

| Tài nguyên | List | Create | Update | Delete |
|---|---|---|---|---|
| Properties | `GET /api/v1/properties` | `POST /api/v1/properties` | `PATCH /api/v1/properties/:propertyId` | chưa cài đặt |
| Rooms | `GET /api/v1/rooms` (`?propertyId=` tuỳ chọn) | `POST /api/v1/rooms` | `PATCH /api/v1/rooms/:roomId` | chưa cài đặt |
| Meter readings | `GET /api/v1/meter-readings?roomId=` (`&billingPeriod=` tuỳ chọn) | `POST /api/v1/meter-readings` | `PUT /api/v1/meter-readings/:readingId` | chưa cài đặt |
| Electricity tariffs | `GET /api/v1/tariffs/electricity` | `POST /api/v1/tariffs/electricity` | `PUT /api/v1/tariffs/electricity/:tariffId` | chưa cài đặt |
| Water tariffs | `GET /api/v1/tariffs/water` | `POST /api/v1/tariffs/water` | `PUT /api/v1/tariffs/water/:tariffId` | chưa cài đặt |

## Không có endpoint DELETE (theo thiết kế)

Room, meter reading, tariff, và invoice tạo thành các quan hệ dữ liệu
tài chính lịch sử với khoá ngoại `RESTRICT` (xem migration 001). Ngữ
nghĩa xoá CRUD mù quáng sẽ đòi hỏi các quyết định sản phẩm mà dự án này
chưa đưa ra: xoá hẳn hay lưu trữ (archive), điều gì xảy ra với tính
toàn vẹn lịch sử khi một dòng được tham chiếu bị xoá, một thao tác xoá
có cần khôi phục được không. Không quyết định nào trong số đó là cần
thiết cho phạm vi hiện tại, nên DELETE **cố ý chưa được cài đặt** ở
bất kỳ đâu trong API này — `DELETE_NOT_IMPLEMENTED_BY_DESIGN=true`.
Đây là một management API cho các field hiện được hỗ trợ, không phải
một tuyên bố về CRUD đầy đủ tổng quát.

## PATCH so với PUT

Property và room dùng `PATCH` (cập nhật một phần — chỉ các field có
mặt trong body mới thay đổi). Meter reading và tariff dùng `PUT` (thay
thế toàn bộ — toàn bộ tài nguyên được chỉ định lại), vì một chỉnh sửa
một phần cho một meter reading hay mảng `tiers` của một tariff có thể
dễ dàng tạo ra một tổ hợp không nhất quán (ví dụ chỉ đổi
`currentReading` mà không kiểm tra lại nó với `meterMaximumValue` sẵn
có).

## Properties

### `POST /api/v1/properties`

```json
{ "name": "Khu trọ A", "address": "123 Đường X" }
```

`address` có thể là `null`. Cả `name` lẫn `address` đều được trim;
`PropertyManagementService` chuẩn hoá một `address` rỗng/chỉ có
khoảng trắng (sau trim) thành `null` — một chuỗi rỗng và "không có địa
chỉ" là cùng một thứ, và API không giữ hai cách biểu diễn cho nó.
`name` không được rỗng sau khi trim (`VALIDATION_ERROR` nếu không).
Response `201`.

### `GET /api/v1/properties`

Trả về mọi property, `ORDER BY id ASC` (xác định — xem
`PropertyRepository.listAll`).

### `PATCH /api/v1/properties/:propertyId`

```json
{ "name": "Tên mới" }
```

Ít nhất một trong `name`/`address` phải có mặt (`VALIDATION_ERROR`
nếu không). `PROPERTY_NOT_FOUND` (`404`) khi id không tồn tại.

## Rooms

### `POST /api/v1/rooms`

```json
{ "propertyId": "1", "name": "101", "tenantCount": 4 }
```

`propertyId` phải tham chiếu một property đang tồn tại
(`PROPERTY_NOT_FOUND`, kiểm tra trước khi ghi) — Service không trông
cậy vào việc khoá ngoại thất bại để báo điều này, vì một not-found rõ
ràng hữu ích hơn một lỗi ghi chung chung. `tenantCount` phải là một số
JSON là số nguyên không âm (`VALIDATION_ERROR` nếu không — không bao
giờ ép kiểu từ một chuỗi bằng `Number(...)`). Response `201`.

### `GET /api/v1/rooms` / `GET /api/v1/rooms?propertyId=1`

`ORDER BY id ASC`. Không có `propertyId`, trả về mọi room qua mọi
property.

### `PATCH /api/v1/rooms/:roomId`

```json
{ "tenantCount": 5 }
```

`propertyId` **không đổi được** trên `PATCH` — nó hoàn toàn không xuất
hiện trong tập field được chấp nhận của body update. Di chuyển một room
giữa các property sẽ đặt ra các câu hỏi về tham chiếu lịch sử (điều gì
xảy ra với các chỉ số công tơ/hoá đơn quá khứ của nó?) mà không có yêu
cầu hiện tại nào đủ để biện minh cho độ phức tạp thêm vào, nên nó nằm
ngoài phạm vi.

### Chống trùng tên room

`UNIQUE(property_id, name)` (migration 001) nghĩa là một tên room chỉ
cần duy nhất **trong phạm vi** một property — cùng tên ở hai property
khác nhau là ổn. Một vi phạm trên `create`/`PATCH` (đổi tên gây trùng)
được dịch thành `ROOM_ALREADY_EXISTS` (`409`), không bao giờ là một lỗi
ràng buộc thô.

### Ngữ nghĩa số người ở — trạng thái hiện tại, không phải lịch sử

`Room.tenantCount` là trạng thái **hiện tại** của room. `PATCH` nó chỉ
thay đổi giá trị hiện tại đó — nó không bao giờ ghi lại bất kỳ hoá đơn
quá khứ nào. `Invoice.tenantCountUsed` là snapshot lịch sử bất biến
chụp lại tại thời điểm hoá đơn đó được tạo (xem
`backend/src/modules/invoice/invoice.model.ts` mục "Vì sao Invoice
snapshot cấu hình" và `docs/CREATE_INVOICE_WORKFLOW.md` mục "Snapshot
của room"). `RoomManagementService` không bao giờ đọc hay ghi bảng
`invoices` — bất biến này đúng đơn giản vì không có đường code nào ở
đây làm điều ngược lại, không phải vì một guard tường minh.

## Meter readings

### `POST /api/v1/meter-readings`

```json
{
  "roomId": "1",
  "billingPeriod": "2026-09-01",
  "utilityType": "ELECTRICITY",
  "previousReading": "0",
  "currentReading": "120",
  "meterMaximumValue": null
}
```

`billingPeriod` dùng **cùng hợp đồng wire `"YYYY-MM-DD"` nghiêm ngặt,
ngày đầu tháng** như invoice (`docs/API.md` mục "Hợp đồng ngày") — chỉ
số công tơ là dữ liệu gắn theo kỳ billing, khác với ngày hiệu lực
tariff (xem "Ngày hiệu lực tariff" bên dưới). `utilityType` là
`"ELECTRICITY"` hoặc `"WATER"`. Response `201`.

### Hợp đồng số (`NUMERIC(12, 2)`)

`previousReading`, `currentReading`, và `meterMaximumValue` (khi khác
`null`) phải là chuỗi thập phân không âm với **tối đa 10 chữ số nguyên
và 2 chữ số thập phân** — khớp chính xác cột `NUMERIC(12, 2)` đã khai
báo của `meter_readings`, để không có gì bị âm thầm làm tròn khi ghi
(cùng loại lỗi đã sửa cho `actualChargedAmount` của invoice — xem
`docs/CREATE_INVOICE_WORKFLOW.md` mục "Sửa lỗi scale
actualChargedAmount"). Không bao giờ dùng
`Number(...)`/`parseFloat(...)`/`Math.round(...)`.

| Giá trị | Kết quả |
|---|---|
| `"0"`, `"120"`, `"120.5"`, `"120.50"`, `"9999999999.99"` | hợp lệ |
| `"-1"`, `"12.345"`, `"10000000000"`, `"abc"` | `400 VALIDATION_ERROR` |

### Tính hợp lệ rollover / tổ hợp chỉ số — dùng lại, không cài đặt lại

Sau kiểm tra hình dạng ở trên, `MeterReadingManagementService` gọi
`calculateMeterUsage` **sẵn có** (Calculation Core,
`backend/src/calculation/meter/calculate-meter-usage.ts`) với
`previousReading`/`currentReading`/`meterMaximumValue` đã submit, và bỏ
qua sản lượng đã tính — nó chỉ cần biết tổ hợp đó có hợp lệ hay không
(không âm, `meterMaximumValue` dương khi có, chỉ số `<=
meterMaximumValue`, rollover chỉ được chấp nhận khi có
`meterMaximumValue`). Đây chính xác là cùng một hàm mà
`CreateInvoiceService` dùng để tính sản lượng tính tiền thật, nên một
reading được chấp nhận ở đây được đảm bảo dùng được cho việc tính hoá
đơn sau này — không có một cài đặt thứ hai, có thể lệch nhau, cho quy
tắc rollover.

### `GET /api/v1/meter-readings?roomId=1` / `&billingPeriod=2026-09-01`

Trả về lịch sử chỉ số cho một room, `ORDER BY billing_period DESC,
utility_type ASC, id ASC` — xác định, không bao giờ dựa vào thứ tự
hàng tự nhiên của PostgreSQL. Bộ lọc `billingPeriod` tuỳ chọn thu hẹp
về một kỳ.

### `PUT /api/v1/meter-readings/:readingId`

Thay thế toàn bộ — cùng hình dạng body như `POST`. Được validate lại
theo cùng cách (hình dạng, rồi `calculateMeterUsage`).

### Bảo vệ tham chiếu lịch sử

Trước khi ghi một `PUT`, Service kiểm tra
`MeterReadingRepository.isReferencedByInvoice(id)` — `true` khi reading
này là `electricity_reading_id` **hoặc** `water_reading_id` của bất kỳ
invoice nào. Nếu vậy, update bị từ chối với `METER_READING_IN_USE`
(`409`). Một chỉ số công tơ đã được dùng để tính hợp pháp và lưu một
hoá đơn đã tính tiền không được âm thầm thay đổi bên dưới hoá đơn đó —
giá trị bằng chứng của hoá đơn phụ thuộc vào việc reading nguồn của nó
giữ nguyên đúng như khi hoá đơn được tạo. (Vi phạm
`UNIQUE(room_id, billing_period, utility_type)` trên `create`/`PUT`
được dịch riêng thành `METER_READING_ALREADY_EXISTS`, `409`.)

## Electricity tariffs

Cấu hình tariff điện là một **aggregate**: một dòng cha
`electricity_tariffs` cộng N dòng con `electricity_tariff_tiers` (dữ
liệu-điều-khiển — bất kỳ số lượng tier nào, không giả định đúng 6).
`create`/`update` ghi cả hai một cách nguyên tử.

### `POST /api/v1/tariffs/electricity`

```json
{
  "name": "Biểu giá điện tháng 10/2026",
  "effectiveFrom": "2026-10-01",
  "effectiveTo": null,
  "electricityVatRate": "0.08",
  "peoplePerQuotaUnit": 4,
  "fallbackTierNumber": 3,
  "tiers": [
    { "tierNumber": 1, "thresholdKwh": "50", "unitPrice": "1984" },
    { "tierNumber": 6, "thresholdKwh": null, "unitPrice": "3460" }
  ]
}
```

Không có giá trị mặc định production nào — mọi giá/tỷ lệ/ngưỡng trong
ví dụ này là dữ liệu input minh hoạ, không phải một hằng số đóng cứng
trong code production (xem "Không hard-code hằng số tariff" bên dưới).
Response `201`, body gồm tariff đã tạo và các tier của nó (cùng hình
dạng với `GET`).

### `GET /api/v1/tariffs/electricity`

Mọi phiên bản tariff, mỗi cái kèm các tier đã sắp xếp:
`ORDER BY effective_from DESC, id DESC` cho tariff, `ORDER BY
tier_number ASC` cho tier của mỗi tariff.

```json
{
  "success": true,
  "data": [
    {
      "tariff": { "id": "1", "name": "...", "effectiveFrom": "2025-05-10", "effectiveTo": "2026-12-31", "electricityVatRate": "0.0800", "peoplePerQuotaUnit": 4, "fallbackTierNumber": 3, "createdAt": "2026-01-01T00:00:00.000Z" },
      "tiers": [ { "id": "1", "tariffId": "1", "tierNumber": 1, "thresholdKwh": "50.00", "unitPrice": "1984.00" } ]
    }
  ]
}
```

`electricityVatRate`/`thresholdKwh`/`unitPrice` có thể trả về theo
đúng scale đã khai báo của cột (ví dụ `"0.0800"`, `"50.00"`) — cùng
một giá trị chính xác, không bị định dạng lại (xem `docs/API.md` mục
"Giá trị tài chính").

### `PUT /api/v1/tariffs/electricity/:tariffId`

Thay thế toàn bộ cả parent **lẫn** toàn bộ tập tier: `name`,
`effectiveFrom`, `effectiveTo`, `electricityVatRate`,
`peoplePerQuotaUnit`, `fallbackTierNumber`, `tiers` (cùng hình dạng
body như `POST`). Chỉ được phép khi tariff chưa được bất kỳ invoice
nào tham chiếu — xem "Bảo vệ tariff lịch sử" bên dưới.

### Transaction aggregate của tariff điện

`ElectricityTariffManagementService.create`/`update` đều ghi qua
`ElectricityTariffUnitOfWork.run(...)` — một interface nhỏ, một
phương thức, mô phỏng trực tiếp theo `InvoiceUnitOfWork`
(`backend/src/repositories/invoice-unit-of-work.ts`). Bên trong một
transaction PostgreSQL thật:

```
create:  INSERT electricity_tariffs (parent)
         INSERT electricity_tariff_tiers (mỗi tier)

update:  UPDATE electricity_tariffs (parent, thay thế toàn bộ)
         DELETE electricity_tariff_tiers WHERE tariff_id = :id
         INSERT electricity_tariff_tiers (mỗi tier mới)
```

Bất kỳ thất bại nào ở bất kỳ bước nào đều rollback toàn bộ — không có
trạng thái nào mà parent được ghi nhưng tier chỉ ghi được một nửa, hay
`update` để lại một hỗn hợp tier cũ và mới. Xem
`backend/src/repositories/postgres/postgres-electricity-tariff-unit-of-work.ts`.

### Validate tỷ lệ / định mức / tier fallback — dùng lại, không phát minh lại

- **Cấu trúc tier** (không rỗng, `tierNumber` dương/duy nhất, đúng một
  tier không giới hạn và nó phải ở cuối): giao hoàn toàn cho
  `validateElectricityConfig` **sẵn có**
  (`backend/src/calculation/electricity/validate-electricity-config.ts`)
  — cùng hàm mà `CreateInvoiceService` dùng. Không có bản sao thứ hai
  của các quy tắc này.
- **`electricityVatRate`**: phải là một chuỗi thập phân chính xác
  trong `[0, 1]` với tối đa 4 chữ số thập phân (khớp `NUMERIC(5, 4)`)
  — so sánh bằng chính các hàm nguyên thuỷ thập phân chính xác của
  Calculation Core (`parseDecimal`/`compare`/`ZERO`/`ONE`,
  `backend/src/modules/tariff/tariff-rate-validation.ts`), không bao
  giờ `Number(...)`.
- **`peoplePerQuotaUnit`**: validate bằng cách gọi `calculateQuotaFactor`
  **sẵn có** với `tenantCount = 1` (một giá trị dò dương an toàn,
  không phải một room thật) — điều này dùng lại đúng quy tắc thật của
  dự án rằng `peoplePerQuotaUnit` phải cho ra một hệ số định mức thập
  phân hữu hạn với mọi số người ở (chỉ có ước nguyên tố 2 và/hoặc 5),
  thay vì bịa ra một quy tắc thứ hai, có thể lỏng hơn, cho input quản
  trị. Một giá trị không hợp lệ thất bại với
  `INVALID_PEOPLE_PER_QUOTA_UNIT`, lan truyền nguyên vẹn từ Calculation
  Core.
- **`fallbackTierNumber`**: phải bằng `tierNumber` của một tier đã
  submit, kiểm tra tường minh tại thời điểm ghi
  (`TARIFF_CONFIGURATION_INVALID` nếu không) —
  `CreateInvoiceService` không phải nơi đầu tiên phát hiện sai lệch
  này.

### Hợp đồng số của tier

- `thresholdKwh` (nullable): `NUMERIC(12, 2)` — tối đa 10 chữ số
  nguyên, 2 chữ số thập phân, dương khi có.
- `unitPrice`: `NUMERIC(14, 2)` — tối đa 12 chữ số nguyên, 2 chữ số
  thập phân, không âm.

Cả hai đều kiểm tra bằng hình dạng (regex), không bao giờ ép kiểu qua
`Number(...)`.

## Water tariffs

`water_tariffs` là một bảng đơn (không có aggregate tier), nên
`create`/`update` mỗi cái là một `INSERT`/`UPDATE` — không cần Unit of
Work.

### `POST /api/v1/tariffs/water`

```json
{
  "name": "Biểu giá nước 2026",
  "effectiveFrom": "2026-10-01",
  "effectiveTo": null,
  "pricePerCubicMeter": "8500",
  "pricePerPerson": "80000",
  "vatRate": "0.05",
  "environmentalFeeRate": "0.10"
}
```

- `pricePerCubicMeter`/`pricePerPerson`: `NUMERIC(14, 2)` — tối đa 12
  chữ số nguyên, 2 chữ số thập phân, không âm.
- `vatRate`/`environmentalFeeRate`: `NUMERIC(5, 4)` — chuỗi thập phân
  chính xác trong `[0, 1]`, tối đa 4 chữ số thập phân (cùng helper
  validate như `electricityVatRate` của điện).

Response `201`.

### `GET /api/v1/tariffs/water`

`ORDER BY effective_from DESC, id DESC`.

### `PUT /api/v1/tariffs/water/:tariffId`

Thay thế toàn bộ (cùng hình dạng body như `POST`). Chỉ được phép khi
tariff chưa được bất kỳ invoice nào tham chiếu.

## Ngày hiệu lực tariff — quy tắc ngày khác với billingPeriod

`effectiveFrom`/`effectiveTo` dùng hình dạng `"YYYY-MM-DD"` nghiêm ngặt
(từ chối chuỗi sai định dạng, ngày lịch không tồn tại, và timestamp có
thành phần giờ) nhưng — khác với `billingPeriod` — **không** yêu cầu
ngày phải là `01`. `effectiveFrom` thật của tariff điện seed mặc định
là `"2025-05-10"` (ngày hiệu lực pháp lý thật theo Quyết định
1279/QĐ-BCT); ép ngày-01 ở đây sẽ từ chối dữ liệu tariff thực sự hợp
lệ.

Điều này được cài đặt bằng hai hàm thuần nhỏ, dùng chung trong
`backend/src/shared/http/date-wire-format.ts`:
`parseDateWireFormat` (bất kỳ ngày lịch hợp lệ nào — dùng cho
`effectiveFrom`/`effectiveTo`) và `parseFirstOfMonthWireFormat` (thêm
kiểm tra ngày-01 — dùng cho `billingPeriod`, và được re-export nguyên
vẹn từ `backend/src/modules/invoice/invoice.http.ts` dưới tên
`parseBillingPeriodWireFormat` để các import/test sẵn có của module
invoice không cần đổi).

## Validate chồng lấn kỳ hiệu lực tariff

Trước `create`/`update`, cả `ElectricityTariffManagementService` lẫn
`WaterTariffManagementService` đều kiểm tra khoảng
`effectiveFrom`/`effectiveTo` đã submit có chồng lấn với bất kỳ phiên
bản tariff *khác* cùng loại không (loại trừ chính tariff đang được
update, khi `update`). Chồng lấn được định nghĩa: `A.effectiveFrom <=
B.effectiveTo AND B.effectiveFrom <= A.effectiveTo`, với một
`effectiveTo` là `null` được coi là không giới hạn ở tương lai. Một
xung đột trả về `TARIFF_PERIOD_OVERLAP` (`409`).

Đây là validate ở **mức ứng dụng**
(`backend/src/modules/tariff/tariff-period-overlap.ts`, dùng chung bởi
cả hai Service) — schema hiện tại (migration 001) không có ràng buộc
`EXCLUDE` cho việc này, và thêm một cái nằm ngoài phạm vi ở đây. Đây là chống xung đột thông thường ở mức quản trị,
không phải một đảm bảo của database: không có isolation `SERIALIZABLE`
hay advisory lock nào được thêm để đóng khoảng hở giữa lúc kiểm tra và
lúc ghi. `CreateInvoiceService` vẫn giữ tuyến phòng thủ thứ hai độc
lập, fail-closed của riêng nó — nếu dữ liệu tariff chồng lấn vẫn tồn
tại bất kể (được tạo trước khi validate này tồn tại, hoặc insert trực
tiếp qua SQL), việc tạo invoice cho một kỳ mơ hồ vẫn thất bại rõ ràng
(`AMBIGUOUS_TARIFF_CONFIGURATION`) thay vì âm thầm chọn đại một cái.

## Bảo vệ tariff lịch sử

Trước một `PUT` trên bất kỳ loại tariff nào, Service kiểm tra xem có
invoice nào tham chiếu tariff đó không (`electricity_tariff_id` hoặc
`water_tariff_id`). Nếu có, update bị từ chối với `TARIFF_IN_USE`
(`409`). Sửa một phiên bản tariff đã được một hoá đơn lịch sử dùng sẽ
âm thầm thay đổi ý nghĩa của "hoá đơn này đã dùng phiên bản tariff X"
— cách sửa đúng là tạo một phiên bản tariff **mới** (một khoảng ngày
hiệu lực mới), không sửa cái cũ. Đây là cùng nguyên tắc snapshot lịch
sử đã ghi cho `Room.tenantCount`/`Invoice.tenantCountUsed` ở trên, áp
dụng cho tariff.

## Không hard-code hằng số tariff

Không có giá trị nào từ dữ liệu seed mặc định (`1984`, `2050`,
`2380`, `2998`, `3350`, `3460`, `8500`, `80000`, `0.08`, `0.05`,
`0.10`, ...) xuất hiện ở bất kỳ đâu trong Service/Controller/Repository
quản lý — mọi giá, tỷ lệ, ngưỡng, và giá trị cấu hình định mức đều do
request body cung cấp và lưu nguyên văn. Các body JSON ví dụ trong tài
liệu này chỉ dùng những giá trị đó như minh hoạ thực tế.

## Ghi chú kiến trúc riêng cho quản lý

- **Composition root**: `backend/src/composition/{property,room,meter-reading,tariff}.composition.ts`
  — một file cho mỗi module, cùng mẫu lazy như `invoice.composition.ts`
  (`docs/API.md` mục "Nối composition / dependency"):
  `getDatabaseClient()` chỉ được gọi bên trong mỗi hàm factory, không
  bao giờ tại thời điểm import module, nên `GET /api/v1/health` vẫn
  hoạt động khi chưa có `DATABASE_URL`, và một request quản lý sai
  định dạng vẫn trả về `400` trước khi chạm bất kỳ phụ thuộc database
  nào.
- **Tiện ích HTTP dùng chung**: `backend/src/shared/http/` nay chứa
  `date-wire-format.ts`, `result-error-status.ts`, và
  `controller-helpers.ts` (bộ ba
  `isPlainRequestBody`/`sendValidationError`/`sendInternalError` mà mọi
  Controller trong API này dùng) — được tách ra từ module invoice để
  năm module không mỗi cái mang một bản gần-trùng-lặp.
  Hành vi của invoice không đổi; các file của chính nó re-export những
  thứ này ở nơi các import sẵn có cần tiếp tục hoạt động.
- **Hàm nguyên thuỷ validate dùng chung**: `backend/src/shared/validation/`
  (`id.ts` — hình dạng id BIGINT; `date.ts` — kiểm tra ngày đầu tháng;
  `decimal-scale.ts` — kiểm tra tổng quát "chuỗi thập phân chính xác
  trong N/M chữ số" dùng cho mọi field `NUMERIC(p, s)` trong API này).
- **`backend/src/database/unique-violation.ts`**: kiểm tra cấu trúc
  SQLSTATE 23505, được tách ra từ `PostgresInvoiceRepository` (nơi ban
  đầu có bản duy nhất) để `PostgresRoomRepository`,
  `PostgresMeterReadingRepository`, `PostgresElectricityTariffRepository`,
  và `PostgresWaterTariffRepository` mỗi cái có thể tự dịch vi phạm
  `UNIQUE` cụ thể của mình thành đúng mã lỗi domain, mà không cần một
  framework ánh xạ SQLSTATE tổng quát.

## Test-source typecheck: đã đóng (trước đây là nợ kỹ thuật)

`backend/tsconfig.json` loại trừ `src/**/__tests__/**` khỏi `npm run
typecheck`. Điều đó nghĩa là lệnh typecheck thông thường không bao giờ
tự type-check bất kỳ file `*.test.ts` nào. Một lần gọi `tsc` strict
thủ công riêng (không thuộc script `npm` thông thường), bao phủ toàn
bộ `src/**/__tests__/**`, xác nhận **PASS hoàn toàn, 0 lỗi** (bao gồm
cả việc sửa các fake
Repository trong `backend/src/modules/invoice/__tests__/fakes.ts` để
thoả mãn đầy đủ interface Repository mở rộng của chúng, không dùng
`any`/`as unknown as`/`@ts-ignore`). Lệnh `npm run typecheck` bình
thường vẫn không bao phủ test — vẫn cần chạy strict check thủ công đó
mỗi khi test source thay đổi — nhưng khoảng nợ kỹ thuật cụ thể này (các
fake không thoả mãn đầy đủ interface) đã được đóng.
