# Workflow CreateInvoice

Tài liệu này giải thích `CreateInvoiceService`
(`backend/src/modules/invoice/create-invoice.service.ts`) và
`GetInvoiceService` (`backend/src/modules/invoice/get-invoice.service.ts`)
— tầng Service/Orchestrator đứng sau REST API hoá đơn, nối tầng
Repository, Calculation Core, và persistence hoá đơn thành các pipeline
fail-fast. Tài liệu bổ sung cho `docs/ARCHITECTURE.md`,
`docs/DATABASE_ACCESS.md`, `docs/TRANSACTIONS.md`, và `docs/API.md`
(hợp đồng HTTP mà các Service này phơi bày qua —
`POST`/`GET /api/v1/invoices`).

## Trình tự

```
1.  Validate input (roomId, billingPeriod, phương pháp tính) -> VALIDATION_ERROR
2.  Đọc Room
3.  Kiểm tra chưa có invoice nào cho (roomId, billingPeriod)
4.  Đọc MeterReading điện (luôn bắt buộc)
5.  Đọc MeterReading nước (chỉ khi waterBillingMethod = PER_CUBIC_METER)
6.  Đọc ElectricityTariff đang có hiệu lực + các tier đã sắp xếp (theo billingPeriod)
7.  Đọc WaterTariff đang có hiệu lực (theo billingPeriod)
------------------------------------------------------------------ (không còn I/O nào bên dưới)
8.  Tính sản lượng công tơ điện (Calculation Core)
9.  Rẽ nhánh tính điện (QUOTA_TIERED | FALLBACK_TIER_FLAT)
10. Tính sản lượng công tơ nước (nếu PER_CUBIC_METER) + tiền nước
11. Tính tổng hoá đơn (cộng các thành phần CHÍNH XÁC, làm tròn ĐÚNG MỘT LẦN)
12. Nếu actualChargedAmount != null: tính chênh lệch hoá đơn
13. Dựng breakdown invoice_items từ kết quả tính toán
------------------------------------------------------------------ (transaction bắt đầu từ đây)
14. InvoiceUnitOfWork.run(...):
      insert invoice
      insert invoice_items
    (commit khi thành công, rollback khi có bất kỳ thất bại nào)
15. Trả về invoice + items đã lưu + breakdown tính toán đầy đủ
```

Bất kỳ `Result` thất bại nào ở bất kỳ bước nào cũng trả về ngay lập tức
— không có bước nào sau thất bại chạy tiếp, và các bước 8–13 (tính
toán) không bao giờ chồng lấn với I/O database.

## Vì sao đọc/tính toán xảy ra trước transaction

Các bước 2–7 (toàn bộ đọc Repository) và các bước 8–13 (toàn bộ
Calculation Core, hàm thuần, không I/O) chạy hoàn toàn **trước** khi
`InvoiceUnitOfWork.run` được gọi. Một transaction PostgreSQL giữ một
kết nối database thật mở suốt thời gian tồn tại của nó; giữ nó mở trong
lúc làm việc tính toán tốn CPU (hay chờ các bước đọc không liên quan)
sẽ chặn kết nối đó một cách vô ích và tăng khả năng transaction sống
lâu hơn cần thiết. Vì vậy transaction chỉ bọc **đúng** hai thao tác ghi
phải nguyên tử — `createInvoice` và `createInvoiceItems` — xem
`docs/DATABASE_ACCESS.md` mục "Transaction" cho cùng quy tắc này ở mức
cơ chế.

## Hoá đơn trùng lặp / race condition

Hai tầng bảo vệ `UNIQUE(room_id, billing_period)`:

1. **Pre-check ở Service** (bước 3): `InvoiceRepository.findByRoomAndPeriod`
   — nếu một invoice đã tồn tại, Service trả về `INVOICE_ALREADY_EXISTS`
   ngay lập tức, trước khi có bất kỳ công việc tính toán hay ghi nào
   xảy ra. Đây là một tối ưu cho đường bình thường (fail fast, tránh
   lãng phí công sức) — nó **không** đủ một mình để ngăn trùng lặp dưới
   điều kiện đồng thời: hai request có thể cùng đọc thấy "chưa có
   invoice" trước khi cái nào insert.
2. **Ràng buộc database thật + dịch lỗi** (giai đoạn ghi):
   `PostgresInvoiceRepository.createInvoice` bắt một `SQLSTATE 23505`
   (vi phạm unique) từ câu `INSERT` thật và dịch nó thành cùng mã
   `INVOICE_ALREADY_EXISTS` — đây là tầng thực sự ngăn hai request đồng
   thời cùng thành công. Request nào thua trong race của `INSERT` sẽ
   nhận `INVOICE_ALREADY_EXISTS`, không phải một lỗi PostgreSQL thô và
   không phải một bản trùng lặp bị âm thầm chấp nhận.

Không có mã lỗi PostgreSQL nào khác được xử lý đặc biệt — mọi thất bại
ghi khác (một ràng buộc khác, mất kết nối, ...) trở thành
`DATABASE_WRITE_FAILED` chung. Dự án này không xây một framework
SQLSTATE-sang-lỗi-domain tổng quát; chỉ đúng một ánh xạ mà một use case
thật cần.

## Bất biến nghiệp vụ liên-bảng (Service ép buộc, không phải database)

Migration 001 cố ý để lại một số quy tắc liên-bảng cho tầng Service (đã
ghi rõ ngay tại bảng `invoices` — xem
`database/migrations/001_initial_domain_schema.sql`):

- `electricity_reading_id` phải thuộc cùng room, cùng kỳ billing, và là
  một reading `ELECTRICITY`.
- `water_reading_id`, khi bắt buộc (`PER_CUBIC_METER`), phải thuộc
  cùng room, cùng kỳ billing, và là một reading `WATER`; với
  `PER_PERSON` nó phải là `null`.
- Các phiên bản tariff điện/nước dùng phải thực sự đang có hiệu lực tại
  `billingPeriod`.

`CreateInvoiceService` thoả mãn tất cả những điều này **bằng cấu
trúc**, không phải bằng cách validate một giá trị caller cung cấp:
caller không bao giờ cung cấp một `tariffId` hay một `readingId` nào
cả. Service luôn tự tra reading qua
`findByRoomPeriodAndUtility(roomId, billingPeriod, utilityType)` và
tariff qua `findApplicableTariffForPeriod(billingPeriod)` — cả hai đều
dựa trên `roomId`/`billingPeriod`, thứ mà chính Service đã validate.
Một API consumer không thể giả mạo một tham chiếu tới reading của một
room không liên quan hay một phiên bản tariff lỗi thời, vì không có
field input nào cho phép nó thử.

## Snapshot của room (số người ở)

`room.tenantCount` được đọc đúng **một lần** (bước 2) và dùng lại cho
mọi mục đích cần tới nó trong cùng một lần thực thi: hệ số định mức
điện (`QUOTA_TIERED`), tính giá nước `PER_PERSON`, và
`invoice.tenantCountUsed` đã lưu. Điều này đảm bảo snapshot của hoá đơn
luôn khớp với những gì thực sự đã dùng để tính ra nó — xem
`backend/src/modules/invoice/invoice.model.ts` mục "Vì sao Invoice
snapshot cấu hình thay vì tham chiếu dữ liệu 'hiện tại'" để biết vì
sao điều này quan trọng (số người ở của một room có thể thay đổi sau
khi một hoá đơn được tạo; hoá đơn không được âm thầm thay đổi theo).

## invoice_items được suy ra từ Calculation Core như thế nào

`buildInvoiceItemBreakdown` (`backend/src/modules/invoice/build-invoice-item-breakdown.ts`)
là một hàm thuần — không I/O, không tự tính toán gì — biến một
`TieredElectricityResult`/`FallbackElectricityResult` và
`WaterChargeResult` đã tính sẵn thành một `NewInvoiceItem[]`, theo thứ
tự cố định, xác định này:

1. Một dòng `ELECTRICITY_TIER` cho mỗi tier đã áp dụng (`QUOTA_TIERED`)
   — hoặc đúng một dòng `ELECTRICITY_TIER` cho toàn bộ sản lượng
   (`FALLBACK_TIER_FLAT`, tại `fallbackTierNumber` đã cấu hình của
   tariff).
2. Một dòng `ELECTRICITY_VAT`.
3. Một dòng `WATER_BASE` (quantity = sản lượng nước tính bằng m³ cho
   `PER_CUBIC_METER`, hoặc số người ở dưới dạng chuỗi thập phân cho
   `PER_PERSON`).
4. Một dòng `WATER_VAT`.
5. Một dòng `WATER_ENVIRONMENTAL_FEE`.

`displayOrder` là một số nguyên tăng dần được gán theo đúng thứ tự đó —
không bao giờ là một hằng số hard-code — nên nó luôn duy nhất và không
có khoảng trống bất kể một cấu hình tariff cụ thể thực sự áp dụng bao
nhiêu tier điện (một tariff 3 tier và một tariff 6 tier đều tạo ra một
breakdown hợp lệ, đúng thứ tự).

## Vì sao giá trị trung gian chính xác được lưu trữ

Mọi `amount`/`quantity`/`unitPrice` ghi vào `invoice_items` đều được
sao chép **nguyên văn** từ kết quả Calculation Core — không bao giờ
làm tròn lại để lưu trữ. `invoice_items.quantity`/`.amount` là
`NUMERIC` không giới hạn scale chính vì lý do này (xem migration
`002_preserve_invoice_item_precision.sql`); làm tròn một dòng
breakdown chỉ để vừa một scale cố định sẽ âm thầm khiến breakdown đã
lưu không nhất quán với con số thực sự đã dùng để tính tổng hoá đơn.
Chỉ `invoice.calculatedTotal` (số tiền VNĐ cuối cùng duy nhất, đã làm
tròn half-up, từ `calculateInvoiceTotal`) mới được làm tròn — xem
`docs/NUMERIC_PRECISION.md` mục "cộng chính xác, làm tròn đúng một
lần."

## actualChargedAmount / chênh lệch hoá đơn

Khi `actualChargedAmount` được cung cấp, Service gọi
`calculateBillingDifference` sẵn có (không đổi, Calculation Core) với
`invoiceTotal.roundedTotalVnd` đã tính sẵn làm số tiền hợp pháp. Kết
quả (`billingDifference`) được trả về cho caller nhưng **không bao giờ
được lưu trữ** — `invoices` cố ý không có cột chênh lệch (xem
`backend/src/modules/invoice/invoice.model.ts` mục "Vì sao không có
field differenceAmount"): nó hoàn toàn được suy ra từ
`calculatedTotal`/`actualChargedAmount`, hai giá trị duy nhất được lưu.
Khi `actualChargedAmount` là `null`, `billingDifference` là `null` —
không có so sánh nào được thực hiện.

## Sửa lỗi scale actualChargedAmount (lỗi ranh giới ghi đã được sửa)

Review độc lập phát hiện một lỗi ranh giới thật sự: `invoices
.actual_charged_amount` là `NUMERIC(14, 2)`, nhưng
`CreateInvoiceService` ban đầu chấp nhận **bất kỳ** chuỗi thập phân
chính xác hợp lệ nào cho `actualChargedAmount` (ví dụ
`"367000.123456"`), tính `billingDifference` từ giá trị *đầy đủ* đó,
và chỉ sau đó mới lưu nó — để PostgreSQL âm thầm làm tròn giá trị lưu
trữ thành `"367000.12"`. `billingDifference` được trả về và
`invoice.actualChargedAmount` đã lưu khi đó sẽ mô tả hai giá trị nguồn
khác nhau — một lỗi tính đúng đắn (correctness bug), không chỉ là vấn
đề hiển thị.

Đã sửa bằng cách validate *hình dạng* của `actualChargedAmount` trong
`validateCreateInvoiceInput` (bước 1, trước bất kỳ Repository read
nào) — `isValidActualChargedAmountScale`
(`backend/src/modules/invoice/invoice-input-validation.ts`): một chuỗi
thập phân không âm, tối đa 12 chữ số nguyên, tối đa 2 chữ số thập phân
(để luôn vừa đúng `NUMERIC(14, 2)`). Chỉ kiểm tra bằng regex — không
bao giờ dùng `Number(...)`/`parseFloat(...)`. Một giá trị không hợp lệ
nay thất bại với `VALIDATION_ERROR` trước cả khi
`roomRepository.findById` được gọi; migration 001 **không** bị chạm
vào, và `actual_charged_amount` **không** bị nới rộng — cột đó đã biểu
diễn đúng "một số tiền thực thu cuối cùng," không phải một phép tính
trung gian, nên bản sửa thuộc về ranh giới input, không phải schema.

## GetInvoiceService — đọc lại dữ liệu đã lưu, không tính lại

`GetInvoiceService` (`backend/src/modules/invoice/get-invoice.service.ts`)
trả lời `GET /api/v1/invoices?roomId=...&billingPeriod=...`. Nó:

1. Validate `roomId`/`billingPeriod` (cùng quy tắc hình dạng như
   `CreateInvoiceService`, tách ra thành
   `invoice-input-validation.ts` để cả hai Service dùng chung một
   implementation).
2. Gọi `InvoiceRepository.findByRoomAndPeriod` — `null` →
   `INVOICE_NOT_FOUND`.
3. Gọi `InvoiceRepository.findItemsByInvoiceId` (phương thức Repository
   mới, `ORDER BY display_order ASC` — không bao giờ dựa vào thứ tự
   hàng tự nhiên của PostgreSQL).
4. Nếu `invoice.actualChargedAmount` đã lưu khác `null`, gọi
   `calculateBillingDifference` với `calculatedTotal` đã lưu — cùng
   quy tắc suy-ra-không-lưu như `CreateInvoiceService`, chỉ khác là
   tính từ những gì thực sự đã lưu.

Nó **không** gọi bất kỳ hàm tính điện/nước nào (`calculateMeterUsage`,
`calculateTieredElectricity`, `calculateWaterCharge`, ...) — một hoá
đơn lịch sử phải trả về đúng số tiền đã tính và tính tiền một cách hợp
pháp tại thời điểm tạo, kể cả khi số người ở của room hay phiên bản
tariff đang hoạt động đã thay đổi kể từ đó (xem "Snapshot của room" ở
trên).

## Bằng chứng runtime thật

Toàn bộ pipeline trên — bao gồm bước ghi transactional (bước 14) và
luồng HTTP đầy đủ `POST`/`GET /api/v1/invoices` — đã được kiểm chứng
bằng PostgreSQL thật, không chỉ dựa trên test giả lập:

- Mọi unit test Calculation Core/Repository/Service/HTTP (Repository/
  UnitOfWork/Service giả, không PostgreSQL) — bao gồm cả test sửa lỗi
  scale `actualChargedAmount` và test Controller dùng
  `Request`/`Response` giả — đều PASS.
- Test tích hợp đường ghi
  (`backend/src/repositories/__tests__/postgres-invoice-unit-of-work.integration.test.ts`,
  bao phủ cả COMMIT lẫn một rollback `UNIQUE(invoice_id, display_order)`
  thật) và test tích hợp API đầu-cuối thật
  (`backend/src/modules/invoice/__tests__/invoice.api.integration.test.ts`,
  một app Express thật trên một cổng ephemeral + `fetch` có sẵn, chạy
  `POST` rồi `GET` qua PostgreSQL thật) đã thực sự CHẠY THẬT trên
  PostgreSQL thật (không chỉ tồn tại dưới dạng code chưa chạy) — commit
  và rollback đều PASS, 0 dòng invoice/invoice_items mồ côi sau
  rollback. Xem
  `docs/DATABASE_ACCESS.md` mục "Transaction" cho cùng bằng chứng ở
  mức cơ chế `runInTransaction`.

## Những gì vẫn được hoãn lại

- Sửa lại/versioning một invoice cho cùng (room, billingPeriod) — ràng
  buộc `UNIQUE(room_id, billing_period)` sẽ cần một thay đổi schema
  trước (xem `backend/src/modules/invoice/invoice.model.ts` mục "Sửa
  lại hoá đơn (tương lai)").
- Xác thực, phân quyền theo vai trò, một khu vực quản trị riêng có
  kiểm soát quyền, và triển khai production — REST API
  (`docs/API.md`) và giao diện trình duyệt (`docs/FRONTEND.md`) hiện
  chưa có cơ chế kiểm soát truy cập nào.

CRUD đầy đủ cho `RentalProperty`/`Room`/`MeterReading`/
`ElectricityTariff`/`WaterTariff`, và giao diện trình duyệt tiêu thụ
toàn bộ workflow này, **đã được cài đặt** — xem
`docs/MANAGEMENT_API.md` và `docs/FRONTEND.md`. Đây không còn là công
việc hoãn lại.
