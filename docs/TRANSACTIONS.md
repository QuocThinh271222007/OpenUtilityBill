# Transaction

Tài liệu này định nghĩa nơi các thuộc tính ACID có ý nghĩa trong
OpenUtilityBill, và các ranh giới transaction mà các workflow ở tầng
Service phải tuân thủ. Tài liệu này bổ sung cho
[`docs/DOMAIN_MODEL.md`](DOMAIN_MODEL.md) và
[`docs/DATABASE_DESIGN.md`](DATABASE_DESIGN.md).

**`CreateInvoice` (mục A), thao tác xoá (mục B), và cấu hình biểu giá
điện (mục C) đều đã được cài đặt đầy đủ** — `CreateInvoice` và thao tác
xoá đều đã được kiểm chứng commit/rollback/RESTRICT/CASCADE thật bằng
PostgreSQL thật (xem `docs/CREATE_INVOICE_WORKFLOW.md` cho
`CreateInvoice`, và `backend/src/modules/invoice/__tests__/delete-management.integration.test.ts`
cho DELETE). Xoá một hàng cha bằng một câu `DELETE` duy nhất đã tự
nguyên tử — không cần một transaction nhiều bước như `CreateInvoice`
hay cấu hình biểu giá điện.

## ACID, trong bối cảnh OpenUtilityBill

**Atomicity (nguyên tử)** — một thao tác ghi nhiều bước hoặc xảy ra
toàn bộ, hoặc không xảy ra chút nào. Ví dụ: tạo một hoá đơn ghi một
dòng `invoices` và nhiều dòng `invoice_items`. Nếu process crash sau
khi dòng `invoices` đã ghi nhưng trước khi mọi dòng `invoice_items`
được ghi xong, người dùng không bao giờ được thấy hoá đơn tạo dở dang
đó — hoặc toàn bộ nó tồn tại, hoặc không có gì tồn tại cả.

**Consistency (nhất quán)** — mọi thao tác ghi để lại database thoả mãn
các ràng buộc của nó (khoá ngoại, ràng buộc `CHECK`, ràng buộc `UNIQUE`
từ `database/migrations/001_initial_domain_schema.sql`). Ví dụ: một
hoá đơn không bao giờ có thể tham chiếu một `room_id` không tồn tại, vì
khoá ngoại khiến trạng thái đó không thể xảy ra, không chỉ là "bị code
ứng dụng khuyến cáo không nên làm".

**Isolation (cô lập)** — các thao tác đồng thời không thấy được thay
đổi đang dang dở, chưa commit của nhau. Ví dụ: nếu hai request cùng cố
tạo một hoá đơn cho cùng phòng và cùng kỳ billing tại cùng một thời
điểm, phần việc dang dở của mỗi transaction vô hình với transaction kia
cho tới khi commit; ràng buộc `UNIQUE (room_id, billing_period)` sau đó
đảm bảo chỉ một trong hai thành công.

**Durability (bền vững)** — một khi transaction commit, kết quả sống
sót qua một lần crash ngay sau đó. Điều này do chính PostgreSQL cung
cấp (qua Supabase); không có code nào trong dự án này cần tự cài đặt
nó.

## A. Tạo hoá đơn (Create Invoice)

**Đã cài đặt** — `CreateInvoiceService`
(`backend/src/modules/invoice/create-invoice.service.ts`), xem
`docs/CREATE_INVOICE_WORKFLOW.md` để có sơ đồ đầy đủ. Đây là ranh giới
transaction thật mà nó tuân theo:

```
BEGIN

1. Kiểm tra dữ liệu bắt buộc tồn tại và hợp lệ (fail-fast, trước bất
   kỳ thao tác ghi nào):
   - Room tồn tại (roomId).
   - MeterReading điện bắt buộc tồn tại cho
     (roomId, billingPeriod, 'ELECTRICITY').
   - Nếu waterBillingMethod = 'PER_CUBIC_METER', MeterReading nước bắt
     buộc tồn tại cho (roomId, billingPeriod, 'WATER').
     (Đây là quy tắc liên-field mà docs/DATABASE_DESIGN.md ghi rõ là
     CỐ Ý KHÔNG phải một ràng buộc CHECK của database — nó được
     validate ở đây, tại tầng Service, trước bất kỳ thao tác ghi nào.)
   - ElectricityTariff và WaterTariff (phiên bản sẽ áp dụng) tồn tại và
     đang có hiệu lực tại billingPeriod.
   - Chưa có invoice nào tồn tại cho (roomId, billingPeriod) — Service
     kiểm tra điều này tường minh để có thể fail với một lỗi
     INVOICE_ALREADY_EXISTS rõ ràng, thay vì chỉ trông cậy vào ràng
     buộc UNIQUE của database để từ chối thao tác ghi.

2. Chạy phép tính (Calculation Core, `backend/src/calculation/`). Bước
   này đọc cấu hình và chỉ số nhưng chưa ghi gì cả — nó chạy HOÀN TOÀN
   BÊN NGOÀI transaction (xem `docs/DATABASE_ACCESS.md` mục
   "Transaction" để biết vì sao).

3. Insert một dòng vào `invoices`, snapshot lại:
   - tenant_count_used (Room.tenantCount tại thời điểm này)
   - electricity_tariff_id / water_tariff_id (đúng phiên bản đã dùng)
   - electricity_billing_method / water_billing_method
   - electricity_reading_id / water_reading_id
   - calculated_total

4. Insert một dòng vào `invoice_items` cho mỗi dòng breakdown mà phép
   tính tạo ra.

COMMIT
```

Nếu **bất kỳ** bước nào từ 3–4 thất bại (vi phạm ràng buộc, mất kết
nối, lỗi bất ngờ), transaction phải `ROLLBACK` — dòng `invoices` và bất
kỳ dòng `invoice_items` nào đã ghi trong lần thử đó biến mất cùng nhau.
Người dùng không bao giờ được thấy, hay truy vấn được, một hoá đơn có
tổng nhưng breakdown bị thiếu hoặc dang dở, hay một breakdown trỏ tới
một hoá đơn không tồn tại đầy đủ.

**Điều gì xảy ra khi bước 3/4 thất bại (cụ thể):** nếu insert
`invoice_items` thất bại giữa chừng (ví dụ vi phạm ràng buộc
`CHECK`/`UNIQUE` trên một dòng, hay mất kết nối), PostgreSQL rollback
toàn bộ transaction — bao gồm cả dòng `invoices` đã insert ở bước 3, và
bất kỳ dòng `invoice_items` nào đã insert trước dòng gây lỗi. Caller
nhận một `Result` thất bại (xem `docs/ERROR_HANDLING.md`); không có
dòng invoice nào bị bỏ lại để caller vô tình coi là hợp lệ. Chính kịch
bản này (một vi phạm `UNIQUE(invoice_id, display_order)` THẬT ở dòng
`invoice_items` thứ hai, sau khi dòng đầu đã thành công) có một
integration test gated bởi `DATABASE_URL` chứng minh điều đó trên
PostgreSQL thật —
`backend/src/repositories/__tests__/postgres-invoice-unit-of-work.integration.test.ts`
— đã được thực thi thật (không chỉ cài đặt) trong lần chạy runtime
closure gần nhất của repository này, với `TRANSACTION_COMMIT_RUNTIME=PASS`
và `TRANSACTION_ROLLBACK_RUNTIME=PASS`.

## B. Thao tác xoá

**Đã cài đặt** — mỗi tài nguyên quản lý có một endpoint
`DELETE /api/v1/...` (xem `docs/MANAGEMENT_API.md` mục "Xóa an toàn
(SAFE DELETE)"), tuân thủ ĐÚNG chính sách `ON DELETE` đã thiết lập sẵn
trong schema từ migration 001 (xem `docs/DATABASE_DESIGN.md`) — không
có constraint nào bị nới lỏng để đơn giản hoá việc xoá
(`DATABASE_MIGRATION_REQUIRED=false`).

- Xoá một `RentalProperty`, `Room`, hay `MeterReading` vẫn còn được dữ
  liệu khác tham chiếu bị database `RESTRICT` — thao tác xoá thất bại
  với một lỗi vi phạm khoá ngoại THẬT (SQLSTATE `23503`), được
  Repository dịch sang lỗi domain rõ ràng
  (`PROPERTY_HAS_DEPENDENCIES`/`ROOM_HAS_DEPENDENCIES`/
  `METER_READING_IN_USE`, xem `backend/src/database/foreign-key-violation.ts`)
  — không lộ lỗi database thô ra cho người dùng (xem
  `docs/ERROR_HANDLING.md`). Không có bước nào cascade-xoá tài nguyên
  phụ thuộc để "cho phép" xoá tài nguyên cha — người dùng phải tự xoá/
  di dời phụ thuộc trước.
- Xoá một `ElectricityTariff`/`WaterTariff` đã được một `Invoice` tham
  chiếu cũng bị `RESTRICT`, dịch sang `TARIFF_IN_USE` (dùng chung mã
  với xung đột UPDATE, xem "Historical tariff protection" trong
  `docs/MANAGEMENT_API.md`). Khi KHÔNG bị tham chiếu, xoá một
  `ElectricityTariff` cascade tới các `electricity_tariff_tiers` của nó
  (`ON DELETE CASCADE` có sẵn ở schema) — một câu `DELETE` cha là đủ,
  KHÔNG cần một Unit of Work riêng như `create`/`update` (xem mục C bên
  dưới), vì xoá đúng một hàng cha bằng một câu SQL duy nhất đã tự
  nguyên tử.
- Xoá một `Invoice` cascade tới các dòng `InvoiceItem` của nó (`ON
  DELETE CASCADE`), vì một dòng breakdown không có ý nghĩa gì nếu thiếu
  invoice cha của nó. Đây là hành động phá huỷ một bản ghi lịch sử/tài
  chính, được yêu cầu tường minh và xác nhận MẠNH ở frontend trước khi
  gửi request (xem `docs/MANAGEMENT_API.md` mục "Xác nhận trước khi
  xoá") — KHÔNG BAO GIỜ đụng tới room/meter_readings/tariffs liên quan,
  và KHÔNG có revision/khôi phục sau khi xoá.

## C. Cấu hình biểu giá điện

**Đã cài đặt** —
`ElectricityTariffUnitOfWork`/`PostgresElectricityTariffUnitOfWork`
(`backend/src/repositories/electricity-tariff-unit-of-work.ts`,
`backend/src/repositories/postgres/postgres-electricity-tariff-unit-of-work.ts`).
Tạo một `ElectricityTariff` mới cùng các tier của nó phải nguyên tử —
một biểu giá chỉ có 3 trong 6 tier được insert không phải một cấu hình
hợp lệ, dùng được:

```
BEGIN

1. Insert một dòng vào `electricity_tariffs`.
2. Insert một dòng vào `electricity_tariff_tiers` cho mỗi tier.

COMMIT
```

Nếu bước 2 thất bại giữa chừng (ví dụ `tier_number` trùng lặp,
`threshold_kwh <= 0`), transaction rollback, bao gồm cả dòng
`electricity_tariffs` từ bước 1. Một biểu giá cấu hình dở dang — tồn
tại trong `electricity_tariffs` nhưng thiếu tier — không bao giờ được
để lộ ra cho phần còn lại của ứng dụng (đặc biệt, nó không bao giờ được
chọn làm `electricityTariffId` cho một hoá đơn, vì Calculation Core sẽ
không biết cách phân bổ sản lượng qua một danh sách tier không đầy đủ).
Hành vi commit/rollback thật này đã được kiểm chứng bằng PostgreSQL
thật —
`backend/src/repositories/__tests__/postgres-electricity-tariff-unit-of-work.integration.test.ts`.

Script seed (`database/seeds/001_default_tariffs.sql`) đã theo
đúng cùng mẫu này: một `BEGIN`/`COMMIT` bọc quanh cả insert biểu giá
lẫn sáu insert tier của nó.

## ACID quan trọng nhất ở đâu trong dự án này

Các ranh giới transaction ở trên (`CreateInvoice`, cấu hình biểu giá
điện) chính xác là những nơi mà lời hứa cốt lõi của OpenUtilityBill —
"một hoá đơn/biểu giá được hiển thị hoặc hoàn toàn đúng, hoặc không
được hiển thị chút nào" — phụ thuộc vào database, không chỉ vào việc
viết code ứng dụng cẩn thận. Mọi thao tác đọc khác trong dự án này (xem
một phòng, liệt kê hoá đơn) là một câu lệnh đọc đơn và không cần một
transaction tường minh nào ngoài những gì một query đơn đã cung cấp
sẵn.
