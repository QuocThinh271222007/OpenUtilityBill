# Thiết kế Database

Tài liệu này giải thích các quyết định ở mức schema đằng sau
`database/migrations/001_initial_domain_schema.sql`. Tài liệu bổ sung
cho [`docs/DOMAIN_MODEL.md`](DOMAIN_MODEL.md) (mỗi thực thể nghĩa là
gì) và [`docs/TRANSACTIONS.md`](TRANSACTIONS.md) (ranh giới
transaction).

## Vì sao dùng database quan hệ

Dữ liệu cốt lõi của OpenUtilityBill vốn mang tính quan hệ: một room
thuộc đúng một property, một invoice tham chiếu đúng một room, một
biểu giá điện, một biểu giá nước, và một hoặc hai chỉ số công tơ, và
mọi tham chiếu đó phải luôn hợp lệ (một invoice không được trỏ tới một
room không còn tồn tại). Khoá ngoại cho phép PostgreSQL tự ép buộc điều
đó. Domain tính hoá đơn cũng cần các thao tác ghi nhiều bước phải cùng
thành công hoặc cùng thất bại (xem `docs/TRANSACTIONS.md`) — một
database quan hệ với transaction thật là lựa chọn tự nhiên.

### Vì sao không dùng NoSQL

Một database document (ví dụ MongoDB) sẽ cần hoặc lặp lại dữ liệu liên
quan vào mỗi document (một tariff nhúng vào mỗi invoice), hoặc tự quản
lý tham chiếu thủ công mà không có sự ép buộc bằng khoá ngoại. Với mức
độ trung tâm của nguyên tắc "invoice này phải tham chiếu đúng phiên bản
tariff này, và tham chiếu đó không bao giờ được treo (dangle)" đối với
tính toàn vẹn của dự án, từ bỏ sự toàn vẹn tham chiếu do database ép
buộc sẽ đánh đổi đúng thứ đảm bảo mà dự án này cần nhất, để lấy một sự
linh hoạt (document không schema) mà dự án này không cần — các thực thể
và quan hệ giữa chúng đã được hiểu rõ và ổn định.

## Các quyết định chuẩn hoá

Schema được chuẩn hoá tới mức mà việc lặp dữ liệu sẽ gây vấn đề thật
sự, và không hơn:

- `RentalProperty` và `Room` là hai bảng riêng biệt (không phải các cột
  `Room` lặp lại theo từng property) vì một property có nhiều room.
- `ElectricityTariff` và `ElectricityTariffTier` là hai bảng riêng biệt
  (không phải các cột `tier1_price`...`tierN_price`) để số lượng tier
  là dữ liệu, không phải schema — xem `docs/DOMAIN_MODEL.md`.
- `MeterReading` dùng một hình dạng chuẩn hoá duy nhất cho cả hai loại
  tiện ích (cột `utility_type`) thay vì hai bảng song song có cấu trúc
  giống hệt nhau.

Ở những nơi việc lặp dữ liệu *thực sự* xuất hiện
(`Invoice.tenantCountUsed`, `InvoiceItem.unitPrice`, tham chiếu tariff
theo ID thay vì theo "phiên bản mới nhất"), đó là có chủ đích — xem
"Snapshot lịch sử có chủ đích" bên dưới. Chuẩn hoá là một công cụ để
tránh các bất thường khi cập nhật (update anomaly), không phải một quy
tắc áp dụng ở mọi nơi bất kể hậu quả.

## Snapshot lịch sử có chủ đích

Xem `docs/DOMAIN_MODEL.md` mục "Nguyên tắc snapshot lịch sử" để có giải
thích đầy đủ kèm bảng ví dụ. Tóm tắt: `Invoice` và `InvoiceItem` đóng
băng đúng các giá trị đã dùng để tính ra chúng (`tenantCountUsed`, ID
*phiên bản* tariff, `InvoiceItem.unitPrice`) chính xác để những chỉnh
sửa sau này trên `Room`, `ElectricityTariff`, hay `WaterTariff` không
thể âm thầm thay đổi một hoá đơn đã phát hành. Đây không phải "chuẩn
hoá sai" — quy tắc chuẩn hoá áp dụng cho dữ liệu tham chiếu *hiện tại,
có thể thay đổi*; một bản ghi lịch sử cố ý ngừng theo dõi giá trị hiện
tại ngay tại thời điểm nó được ghi.

## Chiến lược khoá định danh

Mọi khoá chính đều dùng:

```sql
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
```

Đây là cột identity tự tăng chuẩn của PostgreSQL (bản thay thế hiện đại
cho `SERIAL`). Nó được chọn thay vì UUID vì:

- Không cần extension nào (`pgcrypto`/`uuid-ossp`) — ít thành phần hơn
  để cài đặt/giải thích trên Supabase.
- Dễ giải thích một cách tầm thường: "database tự gán số tiếp theo."
- Không có gì trong schema này cần tới lợi ích thật sự của UUID (gộp
  dòng từ nhiều database độc lập, giấu số lượng dòng khỏi client). Đây
  là một database Postgres đơn, với một đường ghi duy nhất (backend),
  nên những lợi ích đó sẽ phải trả giá mà không dùng tới.

`BIGINT` (không phải `INTEGER`) được chọn đơn giản để không bao giờ
phải lo về trần số nguyên 32-bit, với chi phí lưu trữ không đáng kể.

## Khoá ngoại

Mọi quan hệ trong sơ đồ của `docs/DOMAIN_MODEL.md` đều được ép buộc
bằng một khoá ngoại `REFERENCES` — xem phân tích từng bảng trong báo
cáo chính và comment inline trong file migration để biết chính xác vì
sao mỗi cái tồn tại. Tóm gọn: khoá ngoại là thứ khiến "một invoice
không bao giờ có thể tham chiếu một room đã bị xoá" trở thành một đảm
bảo của database thay vì một quy ước ứng dụng mà ai đó có thể quên
kiểm tra.

## Ràng buộc UNIQUE

| Ràng buộc | Bảng | Vì sao |
|---|---|---|
| `(name, effective_from)` | `electricity_tariffs`, `water_tariffs` | Hỗ trợ seed idempotent qua `ON CONFLICT` (xem `database/seeds/001_competition_defaults.sql`) và ngăn hai dòng cấu hình cùng tên và cùng ngày hiệu lực. |
| `(room_id, billing_period, utility_type)` | `meter_readings` | Đúng một reading cho mỗi room, mỗi tháng, mỗi loại tiện ích — đảm bảo ở mức schema đứng sau bất biến `MeterReading` của `docs/DOMAIN_MODEL.md`. |
| `(tariff_id, tier_number)` | `electricity_tariff_tiers` | Một số tier không được lặp lại trong cùng một phiên bản tariff. |
| `(property_id, name)` | `rooms` | Tên/số room phải không mơ hồ *trong phạm vi một property*. Đây **không** phải một quy tắc duy nhất toàn cục — "Property A / 101" và "Property B / 101" đều hợp lệ, vì chúng thuộc hai property khác nhau. |
| `(room_id, billing_period)` | `invoices` | Một invoice cho mỗi room mỗi tháng, trong phạm vi bắt buộc ban đầu (xem "Sửa lại hoá đơn" bên dưới). |
| `(invoice_id, display_order)` | `invoice_items` | Hai dòng breakdown trên cùng một invoice không được nhận cùng vị trí hiển thị. |

## Ràng buộc CHECK

Mọi bất biến đơn giản, một mục đích, từ danh sách quy tắc số/nghiệp vụ
của đề bài đều được ép buộc bằng một `CHECK`:

- `tenant_count >= 0`, `tenant_count_used >= 0`
- `tier_number > 0`
- `threshold_kwh > 0` khi không `NULL`
- `unit_price >= 0`
- `0 <= electricity_vat_rate <= 1`, `0 <= vat_rate <= 1`,
  `0 <= environmental_fee_rate <= 1` — xem "Tỷ lệ được lưu dưới dạng
  phân số thập phân trong [0, 1]" bên dưới
- `previous_reading >= 0`, `current_reading >= 0`
- `meter_maximum_value > 0` khi có
- `previous_reading <= meter_maximum_value` và
  `current_reading <= meter_maximum_value`, khi `meter_maximum_value`
  có giá trị — xem "Giá trị tối đa của công tơ" bên dưới
- `calculated_total >= 0`
- `actual_charged_amount >= 0` khi có
- `effective_to >= effective_from` khi `effective_to` có giá trị (cả
  hai bảng tariff)
- `billing_period` luôn là ngày đầu tiên của tháng đó
  (`EXTRACT(DAY FROM billing_period) = 1`)
- `utility_type`, `electricity_billing_method`, `water_billing_method`,
  `invoice_items.category` bị giới hạn trong tập giá trị đã ghi rõ
- `(property_id, name)` duy nhất cho mỗi dòng `rooms` — xem bảng ràng
  buộc UNIQUE ở trên

### Tỷ lệ được lưu dưới dạng phân số thập phân trong [0, 1]

`electricity_vat_rate`, `water_tariffs.vat_rate`, và
`environmental_fee_rate` đều biểu diễn một tỷ lệ phần trăm dưới dạng
phân số thập phân: 8% được lưu là `0.08`, không phải `8`. Ràng buộc
`CHECK (rate >= 0 AND rate <= 1)` tồn tại đặc biệt để bắt lỗi cấu hình
phổ biến nhất cho cách biểu diễn này — nhập số phần trăm nguyên (`8`)
thay vì phân số (`0.08`). Giới hạn này **không** áp dụng cho các field
giá (`unit_price`, `price_per_cubic_meter`, `price_per_person`) — đó là
số tiền tệ, không phải tỷ lệ, và không có giới hạn trên tự nhiên nào.

### Giá trị tối đa của công tơ

`meter_readings.meter_maximum_value` là tuỳ chọn (`NULL` khi công tơ
không có mức tối đa xác định/liên quan). Khi nó *có* giá trị, cả
`previous_reading` lẫn `current_reading` phải `<=` nó — một chỉ số
vượt quá mức tối đa do chính công tơ khai báo là bất khả thi về mặt
vật lý và bị từ chối ở mức database. Đây **không** phải một phép tính
rollover: nó không nói gì về việc `current_reading < previous_reading`
là một trường hợp tràn số (wraparound) hợp lệ hay một lỗi nhập liệu
(xem bên dưới) — nó chỉ từ chối các chỉ số không bao giờ có thể đúng
bất kể có rollover hay không.

**Cố ý KHÔNG phải một ràng buộc `CHECK`:** "`water_reading_id` phải
`NOT NULL` khi `water_billing_method = 'PER_CUBIC_METER'`." Đây là một
quy tắc nghiệp vụ thật (xem `docs/DOMAIN_MODEL.md`), nhưng nó là một
quy tắc *điều kiện liên-field* gắn với một quyết định workflow, không
phải một bất biến đơn lẻ đơn giản. Mã hoá nó trong một `CHECK` sẽ làm
mờ ranh giới mà dự án này vạch ra giữa "database ép buộc hình dạng và
phạm vi cơ bản" và "tầng Service ép buộc quy tắc workflow nghiệp vụ"
(xem `docs/ARCHITECTURE.md`). Điều này được validate ở tầng Service
theo kiểu fail-fast, đã cài đặt trong workflow `CreateInvoice` — xem
`docs/TRANSACTIONS.md`.

**Cố ý KHÔNG bị ràng buộc:** `previous_reading <= current_reading`.
Một công tơ rollover vượt qua `meter_maximum_value` có thể hợp lệ báo
một `current_reading` nhỏ hơn `previous_reading` (nó đã vòng trở lại
gần 0). Phân biệt "rollover hợp lệ" với "lỗi nhập liệu" cần nhiều hơn
một kiểm tra biên trên từng chỉ số riêng lẻ (nó cần suy luận về *khoảng
cách* của các chỉ số so với `meter_maximum_value` và theo hướng nào) —
đó chính xác là kiểu phép tính mà dự án này giữ ngoài database (xem
"Vì sao chưa dùng trigger/stored procedure" bên dưới) — nó thuộc về
Calculation Core. Thứ mà database *thực sự* từ chối là một chỉ số vượt
hẳn `meter_maximum_value` (xem "Giá trị tối đa của công tơ" ở trên) —
đó là một kiểm tra biên đơn giản, không phải một phép tính rollover.

## Giá trị suy ra không được lưu trữ

`invoices` lưu `calculated_total` và `actual_charged_amount`, nhưng
**không** có cột `difference_amount`. Chênh lệch
(`actual_charged_amount - calculated_total`) hoàn toàn được suy ra từ
hai giá trị đã lưu đó — nó không phải thông tin mới. Lưu nó thành một
cột thứ ba sẽ tạo ra rủi ro nhất quán: nếu `actual_charged_amount` được
sửa lại sau khi invoice được tạo lần đầu (ví dụ đối chiếu với số tiền
người thuê thực sự đã trả), một `difference_amount` lưu riêng sẽ cần
được cập nhật đồng bộ, nếu không nó sẽ âm thầm trở nên lỗi thời. Nguồn
sự thật duy nhất vẫn chỉ là đúng hai cột; tầng Service/Calculation tính
chênh lệch theo yêu cầu bất cứ khi nào cần hiển thị, thay vì cache nó
trong database. Đây là cùng nguyên tắc "không lưu thứ có thể suy ra"
áp dụng cho một trường hợp mà giá trị suy ra sẽ chỉ lặp lại, chứ không
bảo vệ, ý nghĩa lịch sử — đối lập với sự trùng lặp *có chủ đích* trong
"Snapshot lịch sử có chủ đích" ở trên, vốn tồn tại đặc biệt để ngăn giá
trị thay đổi bên dưới một hoá đơn cũ. Một kết quả số học suy ra không
có rủi ro đó, nên không có lý do gì để snapshot nó.

## Hành vi xoá (chính sách `ON DELETE`)

`ON DELETE CASCADE` **không** được dùng ở mọi nơi — mỗi quan hệ được
quyết định riêng lẻ:

| Quan hệ | Hành vi | Vì sao |
|---|---|---|
| `rooms.property_id → rental_properties` | `RESTRICT` | Một room là dữ liệu nghiệp vụ có ý nghĩa (và có thể có reading/invoice bên dưới nó). Xoá một property không được âm thầm xoá các room của nó — chủ trọ phải tự xử lý room tường minh trước. |
| `meter_readings.room_id → rooms` | `RESTRICT` | Chỉ số công tơ là bằng chứng lịch sử cho các hoá đơn quá khứ. Một room không được biến mất và kéo theo lịch sử chỉ số của nó. |
| `invoices.room_id → rooms` | `RESTRICT` | Cùng lý do: một invoice là một bản ghi tài chính; nó không được biến mất chỉ vì ai đó xoá room. |
| `invoices.electricity_tariff_id / water_tariff_id → tariffs` | `RESTRICT` | Một phiên bản tariff được một hoá đơn lịch sử tham chiếu phải luôn sẵn có để giải thích hoá đơn đó, kể cả sau khi một phiên bản tariff mới hơn ra đời. |
| `invoices.electricity_reading_id / water_reading_id → meter_readings` | `RESTRICT` | Chỉ số mà một hoá đơn được tính từ đó phải luôn truy vết được. |
| `electricity_tariff_tiers.tariff_id → electricity_tariffs` | `CASCADE` | Một tier không có ý nghĩa độc lập nếu thiếu tariff cha của nó — nó *là* một phần cấu hình của tariff đó, không phải một bản ghi đứng riêng. Invoice tham chiếu cả tariff (`electricity_tariff_id`), không bao giờ tham chiếu một dòng tier riêng lẻ, nên cascade xoá tier không thể làm mồ côi hay hỏng lịch sử invoice. |
| `invoice_items.invoice_id → invoices` | `CASCADE` | Một dòng invoice item chỉ tồn tại để giải thích invoice cha của nó; xoá invoice hợp lý sẽ xoá luôn breakdown của nó. |

Quy tắc chung: **`RESTRICT` bảo vệ bất cứ thứ gì là, hoặc nuôi dưỡng,
việc lưu trữ bản ghi lịch sử/tài chính. `CASCADE` chỉ dành cho các dòng
thuần tuý là "một phần của" cha của chúng và không có ý nghĩa hay tham
chiếu nào trỏ tới chúng một cách độc lập.**

## `NUMERIC` so với `FLOAT`

Mọi field biểu diễn tiền, một tỷ lệ, một phí, hay một số tiền tài chính
đã tính (`unit_price`, `electricity_vat_rate`, `vat_rate`,
`environmental_fee_rate`, `price_per_cubic_meter`, `price_per_person`,
`calculated_total`, `actual_charged_amount`,
`invoice_items.amount`/`unit_price`/`quantity`, `threshold_kwh`, chỉ số
công tơ) dùng `NUMERIC(precision, scale)` của PostgreSQL, không bao
giờ `REAL`/`FLOAT`/`DOUBLE PRECISION`.

`FLOAT`/`REAL` là dấu phẩy động nhị phân IEEE-754 — chúng không thể
biểu diễn chính xác hầu hết phân số thập phân (bao gồm cả số tiền như
`0.10`), có thể sinh ra sai số làm tròn nhỏ tích luỹ qua các phép tính.
`NUMERIC` lưu một giá trị thập phân chính xác, đúng thứ một ứng dụng
tính hoá đơn cần: một mức VAT `0.08` phải có nghĩa đúng là `0.08`,
không phải `0.08000000000000000004`.

### `NUMERIC` của database so với biểu diễn runtime của TypeScript

Lưu giá trị dưới dạng `NUMERIC` trong PostgreSQL là một quyết định ở
**tầng database**; tự nó không quyết định cách code TypeScript thực
hiện phép tính trên các giá trị đó — đó là quyết định của Calculation
Core (xem `docs/NUMERIC_PRECISION.md`).

Với các type domain model (`backend/src/modules/*/*.model.ts`), mọi
field được cột `NUMERIC` hỗ trợ đều có kiểu TypeScript `string`, khớp
với cách driver PostgreSQL chuẩn cho Node.js (`pg`) trả về `NUMERIC`
theo mặc định — dưới dạng chuỗi, để tránh âm thầm cắt độ chính xác khi
parse sang một `number` JS (IEEE-754 double, cùng vấn đề biểu diễn như
`FLOAT`/`REAL`).

Calculation Core (`backend/src/calculation/`) parse các chuỗi đó thành
một phân số chính xác (`ExactNumber`, xây trên `BigInt`) tại ranh giới
input của nó, thực hiện mọi phép tính trung gian trên biểu diễn chính
xác đó (không bao giờ trên `number`), và chỉ tạo lại một chuỗi thập
phân tại ranh giới output của nó. Đây là cùng mẫu `string` ↔ giá-trị-
chính-xác ↔ `string` ở cả hai phía của Calculation Core — database và
tầng tính toán đồng thuận về biểu diễn ở ranh giới. Xem
`docs/NUMERIC_PRECISION.md` để biết lý do đầy đủ, bao gồm vì sao không
thêm một thư viện kiểu `decimal.js`.

### Độ chính xác của invoice item

`invoice_items.quantity` và `invoice_items.amount` ban đầu là
`NUMERIC(12, 2)`/`NUMERIC(14, 2)` (cố định 2 chữ số thập phân) trong
`001_initial_domain_schema.sql`. Đây là một lỗ hổng đúng đắn (correctness
bug) tiềm ẩn: Calculation Core cố ý giữ độ chính xác trung gian vượt
quá 2 chữ số thập phân (ví dụ một dung lượng tier đã điều chỉnh theo
quota là `62.5125` kWh — xem `docs/NUMERIC_PRECISION.md` mục 13.5), và
một cột scale cố định sẽ âm thầm cắt giá trị đó ngay khi nó được lưu,
mâu thuẫn với quy tắc "không làm tròn trung gian" tại chính tầng lẽ ra
phải lưu nó trung thực.

`002_preserve_invoice_item_precision.sql` nới cả hai cột thành
`NUMERIC` không giới hạn precision/scale. Đây là một `ALTER COLUMN ...
TYPE NUMERIC` an toàn, không phá huỷ — mọi giá trị vừa trong cột scale
cố định cũ vẫn là một giá trị hợp lệ trong cột không giới hạn mới, nên
không có dữ liệu hiện có nào bị mất hay thay đổi bởi chính migration
đó.

`invoice_items.unit_price` cố ý **không** được nới rộng: nó luôn là
một bản sao chụp trực tiếp từ `electricity_tariff_tiers.unit_price`
hay một cột `water_tariffs.price_per_*`, cả hai đều đã là
`NUMERIC(14, 2)` tại nguồn và không bao giờ được tính/nhân trước khi
snapshot — nên nó không bao giờ có thể mang nhiều hơn 2 chữ số thập
phân bất kể giá trị quota hay ngưỡng, và nới rộng nó sẽ không bảo vệ
được gì. `invoices.calculated_total`/`actual_charged_amount` cũng được
giữ nguyên không đổi — đó là số tiền VNĐ **cuối cùng**, đã làm tròn
(kết quả của `roundHalfUpToInteger`, xem `docs/NUMERIC_PRECISION.md`),
một mối quan tâm khác với việc giữ nguyên giá trị trung gian chưa làm
tròn.

## Phiên bản tariff và ngày hiệu lực

Cả `ElectricityTariff` và `WaterTariff` đều mang `effective_from` và
`effective_to` (nullable — một phiên bản mở/hiện tại không có ngày kết
thúc). Điều này cho phép hệ thống biểu diễn "biểu giá đang có hiệu lực
khi kỳ billing của hoá đơn này xảy ra" như dữ liệu, thay vì giả định
luôn chỉ có một biểu giá. Việc chống chồng lấn giữa các phiên bản
tariff (ví dụ từ chối hai tariff đang hoạt động có khoảng ngày chồng
lấn) **không** được ép buộc trong schema này — làm điều đó bằng một
`CHECK` đơn giản là không thể (ràng buộc `CHECK` không thể so sánh giữa
các dòng), và một giải pháp đúng đắn (một ràng buộc `EXCLUDE` trên một
khoảng ngày) cần extension `btree_gist`, mà task này tránh đưa vào khi
chưa có nhu cầu cụ thể. Nếu các phiên bản tariff chồng lấn trở thành
một vấn đề chất lượng dữ liệu thật sự, đó là ứng viên cho một migration
tương lai, được biện minh tường minh.

### Các ngày seed mang ý nghĩa khác nhau cho điện và nước

`database/seeds/001_competition_defaults.sql` đặt các giá trị
`effective_from`/`effective_to` khác nhau cho hai tariff, và chúng
**không** thể hoán đổi ý nghĩa cho nhau:

- **Điện** (`effective_from = 2025-05-10`,
  `effective_to = 2026-12-31`): `effective_from` là một ngày hiệu lực
  **pháp lý** thật — đặc tả nghiệp vụ trích dẫn Quyết định 1279/QĐ-BCT
  có hiệu lực từ 10/05/2025 cho biểu giá điện gốc. `effective_to =
  2026-12-31` **không** có nghĩa bản thân giá điện hết hạn vào ngày đó
  — nó chỉ giới hạn *dòng cấu hình này*, vốn cũng gộp cả mức VAT điện
  8% theo cấu hình mặc định, vốn chỉ áp dụng tới hết 31/12/2026. Qua
  ngày đó, một dòng `electricity_tariffs` mới (ví dụ với mức VAT cập
  nhật) sẽ cần được seed/insert — schema đã hỗ trợ sẵn điều đó dưới
  dạng một dòng mới với `effective_from` muộn hơn, không cần migration.
- **Nước** (`effective_from = 2026-09-06`, `effective_to = NULL`): đặc
  tả nghiệp vụ không trích dẫn bất kỳ văn bản pháp lý biểu giá nước nào
  có ngày hiệu lực thật. `2026-09-06` được ghi rõ là **ngày kích hoạt/
  công bố của cấu hình mặc định** — ngày các giá trị cố định này được
  xác lập để dùng trong dự án này — không phải một tuyên bố rằng một
  biểu giá nước địa phương thật đã có hiệu lực đúng ngày đó.
  `effective_to` là `NULL` vì không có căn cứ nào cho một ngày kết
  thúc.

Sự phân biệt này quan trọng khi đối chiếu nguồn gốc dữ liệu:
`effective_from` trên `electricity_tariffs` có căn cứ từ một văn bản
pháp lý bên ngoài; `effective_from` trên `water_tariffs` thì không, và
nên được hiểu là "khi cấu hình mặc định này được áp dụng," không phải
"khi một biểu giá nước thật có hiệu lực."

## Vì sao SQL được giữ dễ đọc và trực tiếp

Mọi ràng buộc ở trên đều hiển thị trực tiếp trong
`database/migrations/001_initial_domain_schema.sql` dưới dạng các câu
lệnh `CREATE TABLE` thuần với mệnh đề `CHECK`/`REFERENCES` inline —
không do một công cụ sinh ra, không ẩn sau các decorator model của một
ORM. Người đọc có thể đọc migration từ đầu tới cuối và biết chính xác
database sẽ ép buộc điều gì, không có tầng gián tiếp nào cần lần theo.

## Vì sao không dùng ORM

Xem `docs/LEARNING_NOTES.md` ("Vì sao dùng SQL trực tiếp, chưa dùng
ORM") để biết lý do đầy đủ. Tóm gọn: giá trị chính của một ORM ở đây
(ánh xạ dòng thành object, tự sinh query) không đáng chi phí của một
tầng trừu tượng bổ sung phải học, giải thích, và debug, với một dự án
mà chủ của nó cần tự giải thích được mọi query được sinh ra. SQL trực
tiếp, cô lập sau các module Repository, đạt được mục tiêu cô lập
persistence mà không cần tầng bổ sung đó.

## Vì sao chưa dùng trigger hay stored procedure

Đề bài cho schema này tường minh tránh cả hai, và lý do vẫn đúng ngoài
việc "đề bài nói vậy": trigger và stored procedure đưa logic *vào
trong* database, vô hình với bất kỳ ai đọc codebase TypeScript, và khó
unit-test hơn một hàm TypeScript thuần. Calculation Core của dự án này
cố ý được giữ là TypeScript độc lập với database chính vì để logic
tính toán luôn hiển thị, test được, và debug được ở một chỗ (xem
`docs/ARCHITECTURE.md`). Hai quy tắc nghiệp vụ liên-field mà schema này
*không* ép buộc (`water_reading_id` bắt buộc cho `PER_CUBIC_METER`; so
sánh chỉ số có nhận biết rollover) chính xác là kiểu quy tắc mà nếu
không sẽ dụ dỗ dùng trigger — chúng được hoãn lại cho tầng Service, vì
cùng lý do đó.
