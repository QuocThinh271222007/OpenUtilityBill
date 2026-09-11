# Domain Model

Tài liệu này giải thích các thực thể nghiệp vụ mà OpenUtilityBill biểu
diễn, vì sao mỗi thực thể tồn tại, và chúng liên hệ với nhau như thế
nào. Tài liệu bổ sung cho
[`docs/DATABASE_DESIGN.md`](DATABASE_DESIGN.md) (lý do ở mức schema)
và [`docs/TRANSACTIONS.md`](TRANSACTIONS.md) (ranh giới transaction).

## Sơ đồ domain (ASCII)

```
RentalProperty
    │ 1
    │
    │ N
   Room
    │
    ├──── N MeterReading   (một cho mỗi room + billing_period + utility_type)
    │
    └──── N Invoice
              │
              └──── N InvoiceItem

ElectricityTariff
       │ 1
       │
       │ N
ElectricityTariffTier

WaterTariff   (độc lập — cả PER_CUBIC_METER và PER_PERSON đều nằm ở đây)

Invoice ───tham chiếu───▶ ElectricityTariff (electricityTariffId)
Invoice ───tham chiếu───▶ WaterTariff (waterTariffId)
Invoice ───tham chiếu───▶ MeterReading (electricityReadingId, bắt buộc)
Invoice ───tham chiếu───▶ MeterReading (waterReadingId, tuỳ chọn)
```

Quan hệ được biểu diễn dưới dạng **ID khoá ngoại** (`roomId: number`,
`tariffId: number`, ...), không bao giờ dưới dạng object lồng
nhau/nhúng vào nhau. Xem "Không có phụ thuộc vòng tròn" bên dưới.

## RentalProperty

- **File:** `backend/src/modules/property/property.model.ts`
- **Bảng:** `rental_properties`
- **Trách nhiệm:** biểu diễn một cơ sở cho thuê trọ (ví dụ một khu
  trọ).
- **Field chính:** `id`, `name`, `address` (nullable), `createdAt`.
- **Quan hệ:** cha của `Room` (1 → N).
- **Bất biến:** `name` bắt buộc (`NOT NULL`).
- **Vì sao tồn tại riêng:** nó là gốc của hệ phân cấp property → room.
  Giữ nó là một thực thể riêng biệt (thay vì một field text tự do trên
  `Room`) cho phép một property sở hữu nhiều room mà không lặp lại dữ
  liệu cấp property (tên, địa chỉ) trên từng dòng room.

## Room

- **File:** `backend/src/modules/room/room.model.ts`
- **Bảng:** `rooms`
- **Trách nhiệm:** đơn vị thực sự được tính tiền — mọi chỉ số công tơ
  và hoá đơn thuộc về một room, không thuộc trực tiếp về một property.
- **Field chính:** `id`, `propertyId`, `name`, `tenantCount`,
  `createdAt`.
- **Quan hệ:** thuộc về một `RentalProperty`; cha của `MeterReading` và
  `Invoice` (mỗi loại 1 → N).
- **Bất biến:** `tenantCount >= 0`; `name` duy nhất *trong phạm vi
  property của nó* (`UNIQUE (propertyId, name)`) — không duy nhất toàn
  cục. Hai property khác nhau có thể mỗi cái đều có một room tên
  "101"; cùng một property thì không thể có hai.
- **Vì sao tồn tại riêng:** bản thân một `RentalProperty` không thể
  tính tiền — một `Room` mới có thể. Tách chúng ra cho phép một
  property có nhiều room được tính tiền độc lập, mỗi room có số người ở
  và lịch sử chỉ số riêng.

**Quan trọng:** `tenantCount` là **trạng thái hiện tại**. Nó thay đổi
mỗi khi chủ trọ cập nhật trong ứng dụng. Một hoá đơn lịch sử không được
bị ảnh hưởng bởi thay đổi đó — xem `Invoice.tenantCountUsed` bên dưới
và "Nguyên tắc snapshot lịch sử" trong `docs/DATABASE_DESIGN.md`.

## MeterReading

- **File:** `backend/src/modules/meter-reading/meter-reading.model.ts`
- **Bảng:** `meter_readings`
- **Trách nhiệm:** giá trị công tơ thô trước/hiện tại cho một room, một
  loại tiện ích (`ELECTRICITY` hoặc `WATER`), một kỳ billing.
- **Field chính:** `id`, `roomId`, `billingPeriod`, `utilityType`,
  `previousReading`, `currentReading`, `meterMaximumValue` (nullable),
  `createdAt`.
- **Quan hệ:** thuộc về một `Room`; được `Invoice` tham chiếu
  (`electricityReadingId`, `waterReadingId`).
- **Bất biến:** đúng một reading cho mỗi
  `(roomId, billingPeriod, utilityType)`; `billingPeriod` phải là ngày
  đầu tiên của tháng đó; `previousReading >= 0`, `currentReading >= 0`,
  `meterMaximumValue > 0` khi có; khi `meterMaximumValue` có giá trị,
  cả `previousReading` lẫn `currentReading` phải `<=` giá trị đó (một
  chỉ số vượt quá mức tối đa do chính công tơ khai báo là bất khả thi
  về mặt vật lý — đây chỉ là kiểm tra biên đơn giản, không phải phép
  tính rollover; xem `docs/DATABASE_DESIGN.md` mục "Giá trị tối đa của
  công tơ").
- **Vì sao tồn tại riêng:** cả điện lẫn nước đều cần "một chỉ số trước
  và hiện tại cho một room trong một tháng", chỉ khác nhau ở
  `utilityType`. Một bảng chuẩn hoá duy nhất tránh được hai bảng gần
  như trùng lặp (`electricity_readings`, `water_readings`) hay các cột
  không liên quan bị nhồi vào chung một dòng.

**Cố ý chưa biểu diễn:** phép tính rollover công tơ (điều gì xảy ra khi
`currentReading` vòng qua vượt `meterMaximumValue`). Schema giữ lại
`meterMaximumValue` để Calculation Core có thể cài đặt điều đó sau này.

## ElectricityTariff

- **File:** `backend/src/modules/tariff/tariff.model.ts`
- **Bảng:** `electricity_tariffs`
- **Trách nhiệm:** một *phiên bản* cấu hình tính tiền điện — mức VAT,
  tham số định mức, và số tier dùng cho phương pháp fallback.
- **Field chính:** `id`, `name`, `effectiveFrom`, `effectiveTo`
  (nullable), `electricityVatRate`, `peoplePerQuotaUnit`,
  `fallbackTierNumber`, `createdAt`.
- **Quan hệ:** cha của `ElectricityTariffTier` (1 → N); được
  `Invoice.electricityTariffId` tham chiếu.
- **Bất biến:** `effectiveTo >= effectiveFrom` khi `effectiveTo` có
  giá trị; duy nhất theo `(name, effectiveFrom)`; `0 <=
  electricityVatRate <= 1` (một phân số thập phân, ví dụ `0.08` cho
  8% — xem `docs/DATABASE_DESIGN.md` mục "Tỷ lệ được lưu dưới dạng
  phân số thập phân trong [0, 1]").
- **Vì sao tồn tại riêng biệt với ElectricityTariffTier:** tariff giữ
  cấu hình áp dụng một lần cho mỗi phiên bản (VAT, tham số định mức, số
  tier fallback); các tier là một danh sách độ dài biến đổi thuộc *bên
  dưới* một phiên bản cụ thể. Tách riêng chúng là điều khiến số lượng
  tier trở thành dữ liệu-điều-khiển — xem `ElectricityTariffTier` bên
  dưới.

## ElectricityTariffTier

- **File:** `backend/src/modules/tariff/tariff.model.ts`
- **Bảng:** `electricity_tariff_tiers`
- **Trách nhiệm:** một bậc giá (ngưỡng + đơn giá) bên trong một
  `ElectricityTariff`.
- **Field chính:** `id`, `tariffId`, `tierNumber`, `thresholdKwh`
  (nullable), `unitPrice`.
- **Quan hệ:** thuộc về một `ElectricityTariff`.
- **Bất biến:** duy nhất theo `(tariffId, tierNumber)`; `tierNumber >
  0`; `thresholdKwh > 0` khi không `NULL`.
- **Vì sao tồn tại riêng:** nếu giá các tier là các cột
  (`tier1_price`, `tier2_price`, ...) trên `electricity_tariffs`, số
  lượng tier sẽ bị cố định bởi schema — thay đổi nó nghĩa là phải
  `ALTER TABLE`. Là một bảng con (một dòng cho mỗi tier), số lượng tier
  hoàn toàn là dữ liệu: insert hay xoá một dòng thay đổi nó, không cần
  đổi code hay schema. `thresholdKwh = NULL` là quy ước đã ghi rõ cho
  "tier cuối cùng, sản lượng còn lại không giới hạn".

## WaterTariff

- **File:** `backend/src/modules/tariff/tariff.model.ts`
- **Bảng:** `water_tariffs`
- **Trách nhiệm:** một phiên bản cấu hình tính tiền nước, hỗ trợ cả hai
  phương pháp tính mà nghiệp vụ yêu cầu.
- **Field chính:** `id`, `name`, `effectiveFrom`, `effectiveTo`
  (nullable), `pricePerCubicMeter`, `pricePerPerson`, `vatRate`,
  `environmentalFeeRate`, `createdAt`.
- **Quan hệ:** được `Invoice.waterTariffId` tham chiếu.
- **Bất biến:** `effectiveTo >= effectiveFrom` khi có giá trị; duy
  nhất theo `(name, effectiveFrom)`; `0 <= vatRate <= 1` và
  `0 <= environmentalFeeRate <= 1` (phân số thập phân — xem
  `docs/DATABASE_DESIGN.md` mục "Tỷ lệ được lưu dưới dạng phân số thập
  phân trong [0, 1]"). `pricePerCubicMeter`/`pricePerPerson` là số tiền
  tệ, không phải tỷ lệ, nên không có giới hạn trên như vậy.
- **Vì sao tồn tại riêng (và vì sao không tách nhỏ hơn nữa):**
  `PER_CUBIC_METER` và `PER_PERSON` là hai *phương pháp tính* của cùng
  một phiên bản cấu hình, không phải hai hệ thống độc lập — cả hai
  dùng chung mức VAT, phí môi trường, và ngày hiệu lực. Một bảng duy
  nhất tránh lặp lại cấu hình dùng chung đó thành hai bảng vốn luôn
  phải đổi cùng nhau.

## Invoice

- **File:** `backend/src/modules/invoice/invoice.model.ts`
- **Bảng:** `invoices`
- **Trách nhiệm:** kết quả tính hoá đơn lịch sử cho một room, một kỳ
  billing.
- **Field chính:** `id`, `roomId`, `billingPeriod`, `tenantCountUsed`,
  `electricityTariffId`, `waterTariffId`, `electricityBillingMethod`,
  `waterBillingMethod`, `electricityReadingId`, `waterReadingId`
  (nullable), `calculatedTotal`, `actualChargedAmount` (nullable),
  `createdAt`.
- **Quan hệ:** thuộc về một `Room`; tham chiếu một `ElectricityTariff`,
  một `WaterTariff`, một `MeterReading` điện, và tuỳ chọn một
  `MeterReading` nước; cha của `InvoiceItem` (1 → N).
- **Bất biến:** duy nhất theo `(roomId, billingPeriod)`;
  `calculatedTotal >= 0`; `actualChargedAmount >= 0` khi có.
- **Vì sao tồn tại riêng:** đây là bản ghi bền vững của "thực sự đã
  tính tiền gì và vì sao" — xem "Nguyên tắc snapshot lịch sử" bên dưới.
- **Vì sao không có field `differenceAmount`:** chênh lệch giữa số
  tiền thực thu và số tiền đã tính (`actualChargedAmount -
  calculatedTotal`) hoàn toàn được suy ra từ hai field đã lưu đó. Lưu
  thêm một field thứ ba cho một giá trị suy ra có nguy cơ trở nên lỗi
  thời — nếu `actualChargedAmount` được sửa lại sau này, một
  `differenceAmount` đã lưu trước đó sẽ âm thầm trở nên sai trừ khi có
  gì đó nhớ cập nhật nó theo. Nguồn sự thật duy nhất là
  `calculatedTotal` và `actualChargedAmount`; chênh lệch được tính theo
  yêu cầu bởi tầng Service/Calculation khi cần hiển thị, không được
  lưu trữ. Xem mục "Giá trị suy ra không được lưu trữ" trong
  `docs/DATABASE_DESIGN.md`.

## InvoiceItem

- **File:** `backend/src/modules/invoice/invoice.model.ts`
- **Bảng:** `invoice_items`
- **Trách nhiệm:** một dòng trong breakdown của hoá đơn (ví dụ "Bậc 2:
  50 kWh × 2050 VND", "VAT điện: 8%").
- **Field chính:** `id`, `invoiceId`, `category`, `tierNumber`
  (nullable), `quantity` (nullable), `unitName` (nullable), `unitPrice`
  (nullable), `amount`, `description` (nullable), `displayOrder`.
- **Quan hệ:** thuộc về một `Invoice`.
- **Bất biến:** duy nhất theo `(invoiceId, displayOrder)`;
  `tierNumber > 0` khi có; `unitPrice >= 0` khi có.
- **Vì sao tồn tại riêng:** một `Invoice` chỉ có một
  `calculatedTotal` — một con số đơn không thể tự giải thích chính nó.
  Tách breakdown thành các dòng quan hệ (thay vì một cột JSON) giữ cho
  nó truy vấn và kiểm tra được trực tiếp bằng SQL thuần, theo
  `docs/DATABASE_DESIGN.md`.

## Nguyên tắc snapshot lịch sử

Hai loại dữ liệu xuất hiện trong schema này, và chúng **không** phải là
một, dù trông có vẻ giống nhau:

| Dữ liệu tham chiếu (trạng thái hiện tại) | Snapshot lịch sử (đóng băng tại thời điểm tính toán) |
|---|---|
| `Room.tenantCount` | `Invoice.tenantCountUsed` |
| Dòng `ElectricityTariff` / `WaterTariff` (có thể bị thay thế bởi phiên bản mới hơn sau này) | `Invoice.electricityTariffId` / `waterTariffId` (trỏ đúng phiên bản đã dùng) |
| — | `InvoiceItem.unitPrice` (giá thực sự áp dụng cho dòng đó, tại thời điểm đó) |

Đây là **sự trùng lặp có chủ đích**, không phải một lỗi chuẩn hoá. Nếu
`Invoice` chỉ lưu `roomId` và tra "số người ở hiện tại" hay "biểu giá
hiện tại" mỗi lần được hiển thị, việc sửa room hay thêm một phiên bản
tariff mới sau này sẽ âm thầm thay đổi số tiền trên một hoá đơn cũ đã
phát hành. Với một ứng dụng minh bạch hoá đơn tiện ích, đó sẽ là một
lỗi tính đúng đắn (correctness bug), không phải tối ưu lưu trữ.
Snapshot lại các giá trị thực sự dùng tại thời điểm tính toán là điều
khiến một hoá đơn **ổn định về mặt lịch sử** — xem `docs/DATABASE_DESIGN.md`
để thấy cùng nguyên tắc này áp dụng ở mức schema/ràng buộc.

## Không có phụ thuộc vòng tròn

Mọi quan hệ ở trên được biểu diễn dưới dạng một ID số thuần
(`roomId: number`, `tariffId: number`, ...), không bao giờ dưới dạng
một đồ thị object lồng nhau/nhúng vào nhau
(`room.property.rooms[0].property...`). Điều này giữ cho mỗi model:

- Serialize sang JSON độc lập mà không có chu trình.
- Hiểu được độc lập — đọc `room.model.ts` không bao giờ cần đọc thêm
  `property.model.ts`.
- Không có chu trình import giữa các module (`room.model.ts` không
  import `property.model.ts`, và ngược lại; chỉ `invoice.model.ts`
  import các type phương pháp tính tiền từ `tariff.model.ts`, một phụ
  thuộc một chiều).

## Vì sao không cần đệ quy ở đây

Không có thực thể nào trong số này tạo thành một cấu trúc đệ quy/tự
tham chiếu (không có thực thể nào tham chiếu "nhiều bản thể cùng loại
của chính nó" theo cách một cây thư mục hay một luồng bình luận sẽ
làm). Mọi quan hệ đều là một tham chiếu khoá ngoại phẳng tới một *loại*
thực thể *khác*. Cả TypeScript lẫn SQL đều hỗ trợ đệ quy, nhưng không
có gì mang tính đệ quy để mô hình hoá ở đây — khoá ngoại thuần đơn giản
hơn và đã đủ dùng. Xem `docs/LEARNING_NOTES.md` để thấy cùng lý do này
áp dụng cho việc lặp qua các tier biểu giá.
