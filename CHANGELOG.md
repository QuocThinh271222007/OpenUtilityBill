# Changelog

Mọi thay đổi đáng chú ý của dự án này được ghi lại trong file này.

## [Unreleased]

### Added

- Giao diện trình duyệt bắt buộc: một single-page app Vite + TypeScript
  + Bootstrap (`frontend/src/`) bao phủ toàn bộ workflow bắt buộc —
  tạo/sửa rental property và room, đặt số người ở, nhập và xem chỉ số
  công tơ điện/nước hàng tháng, cấu hình biểu giá điện (số tier động,
  không giả định 6) và biểu giá nước, tạo một hoá đơn kèm hiển thị
  breakdown/tổng hợp pháp đầy đủ, cung cấp số tiền thực thu và xem so
  sánh hợp pháp-thực thu, và mở lại một hoá đơn lịch sử đã lưu (không
  tính lại). Không có dependency runtime mới — `frontend/package.json`
  vẫn chỉ có `bootstrap` (CSS) cộng `typescript`/`vite`. Không React/
  Vue/Angular/Svelte, không thư viện router/quản lý state/chart/form.
  - Router hash tự viết (`controllers/navigation.controller.ts`):
    `#/dashboard`, `#/properties`, `#/rooms`, `#/readings`,
    `#/invoices` (cũng chứa so sánh hợp pháp-thực thu), `#/tariffs`
    (hai tab, Điện/Nước) — không reload trang khi điều hướng.
  - `apiRequest<T>` của `api/api-client.ts` là hàm duy nhất mọi module
    `api/*.api.ts` dùng: luôn dùng đường dẫn tương đối `/api/v1/...`
    (không bao giờ hard-code origin — Vite proxy `/api` ở môi trường
    dev), parse đúng hợp đồng `{ success, data }` /
    `{ success: false, error }` của backend bất kể HTTP status, và
    không bao giờ throw — một lỗi mạng trở thành một `NETWORK_ERROR` an
    toàn do frontend tự viết.
  - Mọi field tài chính/đo lường (`types/*.types.ts`) được typed và xử
    lý dưới dạng `string` từ đầu đến cuối — frontend không bao giờ tự
    tính tiền hoá đơn; `Number(...)`/`parseFloat(...)`/`Math.round(...)`
    không bao giờ được áp dụng cho một giá trị tài chính ở bất kỳ đâu
    trong codebase (đã kiểm chứng). Ngoại lệ có chủ đích duy nhất là
    các field thực sự dựa trên `INTEGER` (`tenantCount`, `tierNumber`,
    `peoplePerQuotaUnit`, `fallbackTierNumber`), đã ghi rõ như vậy.
  - `utils/format.ts`: `formatVndDisplay` (chỉ nhóm hàng nghìn và hiển
    thị VNĐ bằng chuỗi, không bao giờ chuyển qua `Number`),
    `classifyBillingDifference` (phân loại dấu bằng hình dạng chuỗi —
    `startsWith("-")`/regex toàn số 0 — không bao giờ bằng so sánh số
    học), `monthInputToBillingPeriod`/`billingPeriodToMonthInput` (chỉ
    cắt/ghép chuỗi thuần cho `<input type="month">` ↔ `"YYYY-MM-DD"`,
    không object `Date`, không rủi ro timezone local), và `escapeHtml`
    (dùng ở mọi điểm một view nội suy text người dùng/API vào một
    template string).
  - Trình soạn tier biểu giá điện động (`controllers/tariff.controller.ts`):
    thêm/xoá dòng tier thuần dưới dạng element DOM, đọc lại thành
    `ElectricityTariffTierInput[]` khi submit — không giả định cứng 6
    tier. Số tier hiển thị của mỗi dòng (tính lại tuần tự sau mỗi lần
    thêm/xoá) được cố ý giữ tách biệt với một id dòng tăng dần, không
    bao giờ dùng lại, dùng cho cặp `id`/`for` của checkbox "không giới
    hạn", sửa một bug DOM-id trùng lặp thật phát hiện được khi tự audit
    thủ công một chuỗi thêm-sau-khi-xoá trong task này.
  - `TARIFF_IN_USE` trên một `PUT` tariff hiển thị một message cụ thể,
    hành động rõ ràng ("Biểu giá này đã được dùng trong hóa đơn lịch
    sử. Hãy tạo phiên bản biểu giá mới.") thay cho văn bản gốc của
    backend, không có lối vượt qua nào; `METER_READING_IN_USE` và mọi
    mã lỗi backend khác hiển thị đúng message của backend nguyên văn.
  - Khung ứng dụng (`views/layout.view.ts`) thay thế trang
    `index.html` placeholder trước đó: điều hướng sidebar, tiêu đề
    trang, một vùng alert `aria-live` toàn cục, và badge health backend
    sẵn có (`GET /api/v1/health`, kiểm tra không đổi — một health check
    thất bại chỉ cập nhật đúng badge đó, không bao giờ chặn khung ứng
    dụng hay điều hướng). Không có JavaScript của Bootstrap nào được
    load — nút bật/tắt sidebar di động và đóng alert được nối bằng
    `addEventListener` thuần.
  - Xem `docs/FRONTEND.md` để có kiến trúc đầy đủ, sơ đồ màn hình, và
    một ghi nhận trung thực về những gì đã được test runtime (không có
    công cụ trình duyệt nào khả dụng ở phiên đó — xem mục "Những gì
    thực sự đã được test runtime") so với những gì chỉ được kiểm tra
    tĩnh/kiểu.

Không có triển khai production, xác thực, hay khu vực quản trị nào
được đưa vào trong thay đổi này.

### Added

- Management REST API bắt buộc: property, room, meter reading, và cấu
  hình biểu giá điện/nước —
  `GET`/`POST /api/v1/properties`, `PATCH /api/v1/properties/:propertyId`;
  `GET`/`POST /api/v1/rooms` (tuỳ chọn `?propertyId=`),
  `PATCH /api/v1/rooms/:roomId`; `GET`/`POST /api/v1/meter-readings`
  (`?roomId=`, tuỳ chọn `&billingPeriod=`),
  `PUT /api/v1/meter-readings/:readingId`; `GET`/`POST
  /api/v1/tariffs/electricity`, `PUT /api/v1/tariffs/electricity/:tariffId`;
  `GET`/`POST /api/v1/tariffs/water`, `PUT /api/v1/tariffs/water/:tariffId`.
  Mọi Repository (`Property`, `Room`, `MeterReading`,
  `ElectricityTariff`, `WaterTariff`) nay đều hỗ trợ thao tác ghi,
  không chỉ Invoice. Xem `docs/MANAGEMENT_API.md` để có hợp đồng đầy
  đủ. DELETE cố ý chưa được cài đặt cho bất kỳ tài nguyên nào — khoá
  ngoại `RESTRICT` lịch sử khiến ngữ nghĩa xoá trở thành một quyết định
  sản phẩm nằm ngoài phạm vi yêu cầu bắt buộc của kỳ thi
  (`DELETE_NOT_IMPLEMENTED_BY_DESIGN=true`).
- Cài đặt `PropertyRepository` (`listAll`/`findById`/`create`/
  `update`) — trước đây bị hoãn ở giai đoạn nền tảng domain-database vì
  chưa có use case đọc; management API nay cần tới nó.
- Cấu hình biểu giá điện là một aggregate (parent `electricity_tariffs`
  + con `electricity_tariff_tiers`, bất kỳ số lượng tier nào, không
  bao giờ giả định là 6): `create`/`update` ghi cả hai nguyên tử qua
  một `ElectricityTariffUnitOfWork` mới (mô phỏng trực tiếp theo
  `InvoiceUnitOfWork`). `update` thay thế toàn bộ tập tier (xoá hết,
  insert tập đã submit) trong cùng transaction với update parent —
  không có trạng thái nào mà parent được ghi nhưng tier chỉ ghi được
  một nửa.
- Dùng lại, không cài đặt lại: validate cấu trúc tier
  (`validateElectricityConfig`), quy tắc hệ số định mức hữu hạn của
  `peoplePerQuotaUnit` (`calculateQuotaFactor`, dò bằng
  `tenantCount = 1` an toàn), và kiểm tra rollover/tính hợp lệ của
  meter reading (`calculateMeterUsage`, bỏ qua kết quả sản lượng) — tất
  cả đều là hàm Calculation Core đã được `CreateInvoiceService` dùng,
  nên input quản trị bị ràng buộc bởi chính xác cùng quy tắc mà việc
  tính hoá đơn sẽ áp dụng sau này, không phải một bản sao thứ hai, có
  thể lệch nhau.
- Validate chồng lấn kỳ hiệu lực tariff (`TARIFF_PERIOD_OVERLAP`, 409)
  — ở mức ứng dụng (không migration/ràng buộc exclusion mới), độc lập
  với kiểm tra fail-closed `AMBIGUOUS_TARIFF_CONFIGURATION` sẵn có của
  `CreateInvoiceService`, thứ vẫn là tuyến phòng thủ thứ hai.
- Bảo vệ tham chiếu lịch sử: một meter reading đã được dùng làm
  `electricity_reading_id`/`water_reading_id` của một invoice không
  thể update (`METER_READING_IN_USE`, 409); một tariff đã được một
  invoice tham chiếu qua `electricity_tariff_id`/`water_tariff_id`
  không thể update (`TARIFF_IN_USE`, 409) — sửa một trong hai sẽ âm
  thầm thay đổi ý nghĩa của dữ liệu nguồn của một hoá đơn lịch sử.
- Hạ tầng dùng chung tách ra từ module invoice (hành vi không đổi, các
  file của invoice re-export ở nơi cần để import/test sẵn có tiếp tục
  hoạt động): `backend/src/shared/http/`
  (`date-wire-format.ts` — `parseDateWireFormat` cho bất kỳ ngày lịch
  nào so với `parseFirstOfMonthWireFormat` cho ngày hình dạng
  billing-period; `result-error-status.ts` — bảng mã lỗi → HTTP status
  dùng chung; `controller-helpers.ts` —
  `isPlainRequestBody`/`sendValidationError`/`sendInternalError`),
  `backend/src/shared/validation/` (`id.ts`, `date.ts`,
  `decimal-scale.ts` — kiểm tra tổng quát "chuỗi thập phân chính xác
  trong N chữ số nguyên/M chữ số thập phân" dùng cho mọi field
  `NUMERIC(p, s)` trong các endpoint mới), và
  `backend/src/database/unique-violation.ts` (kiểm tra cấu trúc
  SQLSTATE 23505, nay dùng bởi năm Repository thay vì một).
- Composition root mới (`backend/src/composition/{property,room,
  meter-reading,tariff}.composition.ts`), cùng mẫu lazy như
  `invoice.composition.ts` — `GET /api/v1/health` và validate input
  trên mọi endpoint mới vẫn hoạt động khi chưa đặt `DATABASE_URL`.
- Unit test (không PostgreSQL) cho mọi Repository/Service/Controller
  mới, và integration test gated bởi `DATABASE_URL` cho Property (tạo
  → update → đọc), Room (tạo → update → list, vi phạm thật
  `UNIQUE(property_id, name)`), MeterReading (tạo → update → thứ tự
  list, vi phạm `UNIQUE` thật), transaction aggregate của tariff điện
  (commit thật và rollback thật qua một vi phạm thật
  `UNIQUE(tariff_id, tier_number)`), và WaterTariff (tạo → update, vi
  phạm thật `UNIQUE(name, effective_from)`) — tất cả `SKIP` (không
  fail) khi `DATABASE_URL` chưa đặt, khớp mọi integration test khác
  trong lịch sử dự án này tại thời điểm đó.

### Fixed

- Lỗi độ chính xác lưu trữ `actualChargedAmount`: `CreateInvoiceService`
  trước đây chấp nhận bất kỳ chuỗi thập phân chính xác hợp lệ nào cho
  `actualChargedAmount` (ví dụ `"367000.123456"`), tính
  `billingDifference` từ giá trị đầy đủ, rồi để PostgreSQL âm thầm làm
  tròn giá trị `NUMERIC(14, 2)` đã lưu khi ghi — khiến
  `billingDifference` trả về và `actualChargedAmount` đã lưu có thể mô
  tả hai con số khác nhau. Sửa bằng cách validate hình dạng giá trị
  (không âm, ≤ 12 chữ số nguyên, ≤ 2 chữ số thập phân — chỉ regex,
  không bao giờ `Number()`/`parseFloat()`) trong
  `validateCreateInvoiceInput`, trước bất kỳ Repository read nào.
  Migration 001 không bị chạm vào và `actual_charged_amount` không bị
  nới rộng — xem `docs/CREATE_INVOICE_WORKFLOW.md` mục "Sửa lỗi scale
  actualChargedAmount".

### Added

- REST API hoá đơn: `POST /api/v1/invoices` và `GET /api/v1/invoices`
  — các endpoint HTTP nghiệp vụ thật đầu tiên, nối Route → Controller →
  Service không có business logic hay SQL nào trong Controller
  (`backend/src/modules/invoice/{invoice.routes,invoice.controller,invoice.http}.ts`).
  `billingPeriod` trên wire nghiêm ngặt `"YYYY-MM-DD"` (từ chối hình
  dạng sai, ngày lịch không tồn tại, và giá trị không phải đầu tháng
  với `400 VALIDATION_ERROR`); giá trị tài chính và ID vẫn là chuỗi
  thập phân/BIGINT từ đầu đến cuối; field `Date` được serialize tường
  minh (`billingPeriod` → `"YYYY-MM-DD"`, `createdAt` → ISO-8601 đầy
  đủ). Một bảng mã lỗi → HTTP status tường minh duy nhất
  (`mapResultErrorCodeToHttpStatus`) ánh xạ thất bại `Result` thành
  `400`/`404`/`409`/`422`/`500`; một mã không nhận diện được và bất kỳ
  exception bất ngờ nào (không phải `Result`) đều rơi vào một `500`
  chung, không bao giờ là một stack trace. Xem `docs/API.md`.
- `GetInvoiceService` (`backend/src/modules/invoice/get-invoice.service.ts`):
  đọc lại một hoá đơn đã lưu, thuộc lịch sử — validate input, đọc hoá
  đơn và item của nó (`InvoiceRepository.findItemsByInvoiceId`, mới,
  `ORDER BY display_order ASC`), và suy ra `billingDifference` từ
  `calculatedTotal`/`actualChargedAmount` đã lưu. **Không** tính lại
  điện/nước — một hoá đơn lịch sử phải tiếp tục trả về đúng số tiền đã
  tính hợp pháp tại thời điểm tạo kể cả khi tariff hay số người ở đã
  thay đổi kể từ đó.
- `backend/src/composition/invoice.composition.ts`: composition root
  dựng `CreateInvoiceService`/`GetInvoiceService` thật, chạy trên
  Postgres. Cố ý lazy — `getDatabaseClient()` chỉ bao giờ được gọi bên
  trong mỗi hàm factory, và Controller chỉ gọi factory *sau khi*
  validate request — nên import `app.ts` (và do đó
  `GET /api/v1/health`) không bao giờ phụ thuộc `DATABASE_URL`, và kể
  cả một request invoice sai định dạng vẫn trả về `400` (không phải
  `500`) khi chưa cấu hình database.
- Unit test (không PostgreSQL) cho: sửa lỗi scale `actualChargedAmount`
  (`create-invoice.service.test.ts`); orchestration của
  `GetInvoiceService` (`get-invoice.service.test.ts`); các helper HTTP
  thuần — parse/format ngày, serialize, ánh xạ mã lỗi
  (`invoice.http.test.ts`); và Controller, dùng `Request`/`Response`
  giả cộng một Service giả, không Express server
  (`invoice.controller.test.ts`). Một integration test thật gated bởi
  `DATABASE_URL` (`invoice.api.integration.test.ts`) chạy một app
  Express thật (`app.listen(0)`) qua một round-trip HTTP thật với
  `fetch` có sẵn của Node — không `supertest` hay dependency test mới
  nào khác — bao phủ `POST` → `GET` → `POST` trùng (`409`) trên
  PostgreSQL thật; nó `SKIP` (không fail) khi `DATABASE_URL` chưa đặt,
  và tại thời điểm đó chưa được `TEST_RUNTIME_EXECUTED` trong lịch sử
  repository này.

Không có CRUD property/room/meter-reading/tariff, xác thực, phân
quyền, khu vực quản trị, hay công việc frontend nào được đưa vào trong
thay đổi này.

### Added

- Workflow CreateInvoice: đường ghi Service/Orchestrator hoàn chỉnh
  đầu tiên, nối Repository đọc, Calculation Core, và persistence hoá
  đơn transactional. `CreateInvoiceService`
  (`backend/src/modules/invoice/create-invoice.service.ts`) validate
  input, đọc dữ liệu Room/MeterReading/Tariff, rẽ nhánh tính điện
  QUOTA_TIERED/FALLBACK_TIER_FLAT và tính nước
  PER_CUBIC_METER/PER_PERSON, cộng các thành phần chính xác và làm
  tròn đúng một lần cho tổng cuối cùng, tính một chênh lệch số tiền
  thực thu tuỳ chọn, và lưu hoá đơn + breakdown đầy đủ một cách
  nguyên tử. Xem `docs/CREATE_INVOICE_WORKFLOW.md` để có trình tự đầy
  đủ.
- Mở rộng `InvoiceRepository` với thao tác ghi — `createInvoice`,
  `createInvoiceItems` — dùng type input riêng `NewInvoice`/
  `NewInvoiceItem` (không phải `Omit<Invoice, ...>`/`Partial<Invoice>`).
  Implementation Postgres dùng `INSERT ... RETURNING` để domain object
  trả về luôn phản ánh đúng dòng thực sự đã lưu, và dịch một vi phạm
  unique `SQLSTATE 23505` trên `createInvoice` (ràng buộc
  `UNIQUE(room_id, billing_period)`) thành `INVOICE_ALREADY_EXISTS` —
  chốt chặn race-condition thật đứng sau pre-check của chính Service
  (cần thiết nhưng không đủ một mình).
- `InvoiceUnitOfWork` (`backend/src/repositories/invoice-unit-of-work.ts`,
  implementation Postgres
  `backend/src/repositories/postgres/postgres-invoice-unit-of-work.ts`):
  một interface nhỏ, một phương thức (`run(work)`) cho phép
  `CreateInvoiceService` chạy `createInvoice`/`createInvoiceItems`
  trong một transaction thật mà không cần tự import Postgres.js,
  `DatabaseExecutor`, hay `runInTransaction` — giữ nguyên ranh giới
  Service/Repository.
- Unit test cho các phương thức ghi repository mới (ánh xạ dòng,
  `INSERT ... RETURNING` thành công, ánh xạ SQLSTATE 23505 →
  `INVOICE_ALREADY_EXISTS`, thất bại ghi chung → `DATABASE_WRITE_FAILED`)
  và cho orchestration của `CreateInvoiceService` (Repository/UnitOfWork
  giả tự viết, không PostgreSQL) — đường thành công cho cả hai phương
  pháp điện và cả hai phương pháp nước, invoice trùng lặp, thiếu
  reading, `tenantCount = 0`, rollover công tơ, và cả hai nhánh so
  sánh `actualChargedAmount`. Một integration test gated bởi
  `DATABASE_URL`
  (`backend/src/repositories/__tests__/postgres-invoice-unit-of-work.integration.test.ts`)
  chứng minh, trên PostgreSQL thật khi có sẵn, cả một commit đầy đủ lẫn
  một rollback thật (một vi phạm thật `UNIQUE(invoice_id,
  display_order)` trên insert `invoice_items` thứ hai rollback cả
  invoice và item đầu đã insert) — nó `SKIP`, và tại thời điểm đó chưa
  được `TEST_RUNTIME_EXECUTED`, khi `DATABASE_URL` chưa đặt.

Không có route Express, Controller, endpoint REST tính tiền, hay công
việc frontend nào được đưa vào trong thay đổi này.

### Added

- Nền tảng truy cập database: thêm `postgres` (Postgres.js) làm client
  PostgreSQL — không ORM/query-builder. `backend/src/database/`:
  `postgres-client.ts` (một client cấp ứng dụng, cache, không tự cài
  connection pool riêng), `transaction.ts` (`runInTransaction`, một
  wrapper trả `Result` bọc quanh `sql.begin()`, thiết kế để rollback
  khi `Result` thất bại và commit khi thành công — có kèm một
  integration test thử điều này trên PostgreSQL thật, chạy khi có
  `DATABASE_URL`), `database.types.ts`. Load `DATABASE_URL` fail-fast
  trong `backend/src/config/database.config.ts`.
- Tầng Repository chỉ đọc (`backend/src/repositories/`): interface
  (`RoomRepository`, `MeterReadingRepository`,
  `ElectricityTariffRepository`, `WaterTariffRepository`,
  `InvoiceRepository`) với implementation Postgres dưới
  `repositories/postgres/`. Ánh xạ dòng-sang-domain-model tường minh,
  viết tay (không thư viện ánh xạ tự động); chỉ query tham số hoá
  (zero `sql.unsafe`); tra cứu tariff thất bại rõ ràng
  (`AMBIGUOUS_TARIFF_CONFIGURATION`) thay vì đoán mò khi có nhiều hơn
  một phiên bản tariff khớp một kỳ billing, vì schema không ngăn các
  khoảng ngày hiệu lực chồng lấn. `PropertyRepository` và thao tác ghi
  (tạo invoice) cố ý chưa được cài đặt — chưa có use case hiện tại cần
  tới chúng.
- Đã kiểm chứng, bằng cách đọc `node_modules/postgres/src/types.js`
  (không có parser đăng ký cho OID kiểu `NUMERIC`/`BIGINT`) và README
  của chính thư viện (xác nhận điều này tường minh), rằng Postgres.js
  trả về cả `NUMERIC` lẫn `BIGINT` dưới dạng chuỗi chính xác theo mặc
  định, với zero cấu hình kiểu tuỳ biến — khớp hợp đồng độ chính xác
  của dự án mà không tạo rủi ro ép kiểu dấu phẩy động. Có kèm
  integration test chứng minh điều này trên một kết nối PostgreSQL
  thật (bao gồm một case `NUMERIC(p, s)` scale cố định khớp schema
  thật, ví dụ `"0.0800"` không phải `"0.08"`), chạy khi có
  `DATABASE_URL`.
- Đổi mọi field ID của domain model (`RentalProperty.id`, `Room.id`,
  `Room.propertyId`, và mọi field `id`/`...Id` khác trong
  `backend/src/modules/*/*.model.ts`) từ `number` sang `string`, vì
  mọi cột `id` là `BIGINT` và một `number` JS không thể biểu diễn an
  toàn mọi giá trị `BIGINT` có thể có. Điều này khớp hành vi `BIGINT`
  mặc định của chính Postgres.js, nên không có chuyển đổi nào xảy ra
  trong tầng Repository. Các cột `INTEGER` không phải identity
  (`tenantCount`, `tierNumber`, v.v.) không bị ảnh hưởng.
- `docs/DATABASE_ACCESS.md`: Postgres.js so với ORM, ranh giới
  Repository, query tham số hoá, vòng đời kết nối, transaction, ranh
  giới độ chính xác `NUMERIC`/`BIGINT`, dịch lỗi, và cái gì phải/không
  được coi là bí mật.
- Unit test (không cần database thật) cho load config, ánh xạ dòng, và
  ngữ nghĩa lỗi cho mọi Repository. Integration test
  (`*.integration.test.ts`) được cài đặt để chứng minh, khi chạy trên
  PostgreSQL thật, việc round-trip `NUMERIC`/`BIGINT` (bao gồm cột
  scale cố định), commit/rollback transaction, và đọc repository trên
  dữ liệu đã seed — các test này `skip` (không fail) khi
  `DATABASE_URL` chưa đặt.

Không có CRUD, `CreateInvoiceService`, endpoint REST tính tiền, hay
công việc frontend nào được đưa vào trong thay đổi này.

### Fixed

- Đóng một sai lệch độ chính xác giữa Calculation Core và database:
  `invoice_items.quantity`/`.amount` từng là
  `NUMERIC(12,2)`/`NUMERIC(14,2)` (cố định 2 chữ số thập phân), có thể
  âm thầm cắt các giá trị trung gian chính xác mà Calculation Core cố
  ý giữ lại (ví dụ một dung lượng tier đã điều chỉnh theo quota là
  `62.5125` kWh). Thêm
  `database/migrations/002_preserve_invoice_item_precision.sql`, nới
  cả hai cột thành `NUMERIC` không giới hạn (một `ALTER COLUMN ...
  TYPE` an toàn, không phá huỷ); `unit_price` và các tổng cuối cùng đã
  làm tròn của bảng invoices cố ý được giữ nguyên (xem
  `docs/DATABASE_DESIGN.md` mục "Độ chính xác của invoice item" để
  biết vì sao). Thêm
  `database/validation/004_invoice_item_precision_validation.sql`
  chứng minh PostgreSQL giữ được giá trị 4-6 chữ số thập phân sau
  migration. Migration 001 không bị sửa đổi.
- Loại bỏ một round-trip nội bộ không cần thiết:
  `calculateTieredElectricity` nay gọi trực tiếp
  `calculateQuotaFactorExact` mới (trả về `ExactNumber`) thay vì parse
  lại kết quả chuỗi của `calculateQuotaFactor`. Chuỗi thập phân chỉ
  còn dùng cho ranh giới module/API/database, không dùng để truyền
  thông tin giữa các bước tính toán nội bộ gắn kết chặt.
- Làm quy tắc "cấu hình quota phải cho ra một số thập phân hữu hạn"
  tường minh và nhất quán: `calculateQuotaFactor`/`calculateQuotaFactorExact`
  nay tự validate `peoplePerQuotaUnit` (qua `isFiniteDecimalDenominator`
  mới) *trước khi* chia, độc lập với `tenantCount`. Trước đây, cùng
  một `peoplePerQuotaUnit` (ví dụ `3`) có thể thành công hay thất bại
  tuỳ vào `tenantCount` nào được áp dụng (ví dụ `3/3` thành công,
  `1/3` thất bại) — nay nó bị từ chối nhất quán cho mọi `tenantCount`,
  dễ đoán và dễ giải thích hơn cho một cấu hình tariff. Case chính
  thức `peoplePerQuotaUnit = 4`, và mọi giá trị chỉ có ước nguyên tố 2
  và/hoặc 5, không bị ảnh hưởng. Toàn bộ 7 test case chính thức vẫn
  không đổi và PASS.
- Thêm `backend/src/calculation/__tests__/public-json-safety.test.ts`,
  kiểm chứng không có object kết quả public nào của Calculation Core
  làm lộ một `bigint` (mọi kết quả public đều `JSON.stringify` thành
  công).

### Added

- Calculation Core (`backend/src/calculation/`): engine tính hoá đơn
  TypeScript thuần, không phụ thuộc Express/database. Số học phân số
  chính xác dựa trên `BigInt` (`shared/exact-number.ts`) thay thế dấu
  phẩy động cho mọi giá trị tài chính, để độ chính xác trung gian (ví
  dụ ngưỡng 62.5 kWh đã điều chỉnh quota, VAT 11192.4 VNĐ) không bao
  giờ bị mất trước bước làm tròn half-up cuối cùng duy nhất.
  - Sản lượng công tơ, bao gồm cả xử lý rollover (`meter/`).
  - Validate tier điện cấu hình hoá, dữ liệu-điều-khiển và phân bổ lặp
    đã điều chỉnh theo quota (`electricity/`), hỗ trợ cả hai phương
    pháp tính `QUOTA_TIERED` và `FALLBACK_TIER_FLAT`.
  - Tính tiền nước cho cả hai phương pháp `PER_CUBIC_METER` và
    `PER_PERSON`, với phí môi trường được tính đúng từ số tiền cơ sở
    (không phải base + VAT).
  - Tính tổng hoá đơn (cộng các tổng chính xác, làm tròn một lần) và so
    sánh chênh lệch thực thu (chỉ tính ra, không lưu trữ).
  - Không có hằng số biểu giá riêng của kỳ thi ở bất kỳ đâu trong code
    tính toán production — mọi cấu hình là tham số hàm.
- `backend/src/calculation/__tests__/`: unit test tự động dùng
  `node:test` + `node:assert/strict` có sẵn của Node (chạy qua `tsx`,
  không dependency test framework mới), bao gồm cả 7 test case chính
  thức đã công bố của kỳ thi và test biên cho mọi ràng buộc đã ghi rõ
  (`npm test` trong `backend/`).
- `docs/CALCULATION_CORE.md` và `docs/NUMERIC_PRECISION.md` ghi lại
  pipeline tính toán và chiến lược số học chính xác.

Không có CRUD, Repository, kết nối Supabase thật, endpoint REST tính
tiền, hay màn hình tính tiền frontend nào được đưa vào trong thay đổi
này.

### Fixed

- Sửa mô hình thực thi kiểm chứng runtime của Supabase SQL Editor (hạ
  tầng test, không phải domain schema). File đơn trước đó
  (`database/validation/001_domain_runtime_validation.sql`) trông cậy
  vào `SAVEPOINT`/`ROLLBACK TO SAVEPOINT` để khôi phục sau các lỗi
  ràng buộc cố ý trong một lần paste-chạy lớn — nhưng một SQL client
  dừng gửi câu lệnh sau lỗi đầu tiên sẽ không bao giờ tới được
  `ROLLBACK TO SAVEPOINT` đó, phá hỏng mọi test sau nó. Thay bằng
  `database/validation/001_domain_success_validation.sql` (zero lỗi cố
  ý, an toàn để chạy như một lần thực thi) và
  `database/validation/002_domain_constraint_validation.sql` (18 khối
  đánh số độc lập, tự đủ — `D1`–`D18` — mỗi khối chạy riêng, có setup
  và dọn dẹp riêng, để không khối nào phụ thuộc một khối trước đã chạy
  hay vào việc SQL client tiếp tục sau một lỗi). Thêm
  `database/validation/003_validation_cleanup.sql` như một lưới an
  toàn chỉ bao giờ xoá các dòng có tiền tố `VALIDATION_*`.
- Sửa ngày seed tariff của kỳ thi: `effective_from` của điện nay trích
  dẫn ngày pháp lý thật (10/05/2025, theo Quyết định 1279/QĐ-BCT) với
  `effective_to = 2026-12-31` ghi rõ là giới hạn cấu hình VAT 8% đã
  seed, không phải giá gốc; `effective_from` của nước (06/09/2026)
  được ghi rõ là ngày kích hoạt cấu hình của kỳ thi, không phải một
  ngày tariff pháp lý, với `effective_to` để `NULL`.
- Xoá field/cột `difference_amount` suy ra khỏi `invoices` và model
  `Invoice` — nó lặp lại `actual_charged_amount - calculated_total` và
  có nguy cơ lỗi thời; nay được tính theo yêu cầu thay vì lưu trữ.
- Thêm `UNIQUE (property_id, name)` vào `rooms` để một tên room không
  mơ hồ trong phạm vi một property (không phải toàn cục).
- Thêm ràng buộc `CHECK` để `previous_reading`/`current_reading` không
  thể vượt quá một `meter_maximum_value` đã khai báo.
- Thắt chặt `electricity_vat_rate`, `water_tariffs.vat_rate`, và
  `environmental_fee_rate` thành `0 <= rate <= 1`, vì tỷ lệ được lưu
  dưới dạng phân số thập phân (ví dụ `0.08`, không phải `8`).

### Added

- Nền tảng domain model và database: type domain TypeScript cho
  `RentalProperty`, `Room`, `MeterReading`, `ElectricityTariff`,
  `ElectricityTariffTier`, `WaterTariff`, `Invoice`, và `InvoiceItem`
  (`backend/src/modules/{property,room,meter-reading,tariff,invoice}/`).
- Schema PostgreSQL ban đầu
  (`database/migrations/001_initial_domain_schema.sql`): mọi bảng
  domain kèm khoá ngoại, ràng buộc `UNIQUE`/`CHECK`, kiểu tài chính
  `NUMERIC`, và chính sách `ON DELETE` có chủ đích cho từng quan hệ.
- Cấu hình biểu giá mặc định chính thức của kỳ thi làm dữ liệu seed
  (`database/seeds/001_competition_defaults.sql`): VAT điện, số người/
  định mức, tier fallback, 6 tier điện, và giá/VAT/phí môi trường
  nước — lưu dưới dạng dữ liệu, không hard-code.
- `docs/DOMAIN_MODEL.md`, `docs/DATABASE_DESIGN.md`, và
  `docs/TRANSACTIONS.md` ghi lại trách nhiệm của từng thực thể, lý do
  thiết kế schema, và ranh giới ACID/transaction cho các workflow ghi
  tương lai.

Không có công thức tính toán, kết nối database thật, hay CRUD
(Controller/Service/Repository) nào được đưa vào trong thay đổi này.

- Nền tảng dự án: tài liệu repository (`README.md`,
  `THIRD_PARTY_NOTICES.md`, `docs/ARCHITECTURE.md`,
  `docs/LEARNING_NOTES.md`, `docs/ERROR_HANDLING.md`,
  `docs/DEVELOPMENT.md`).
- Nền tảng backend (`backend/`): Node.js + TypeScript + Express, với
  `app.ts`/`server.ts` tách riêng, hợp đồng `Result<T>` dùng chung
  (`backend/src/shared/result.ts`), và một health endpoint versioned
  (`GET /api/v1/health`) minh hoạ ranh giới Route → Controller →
  Service.
- Nền tảng frontend (`frontend/`): client Vite + TypeScript + Bootstrap
  với một cấu trúc `api/ → controllers/ → views/` tối thiểu hiển thị
  trạng thái backend trực tiếp trên trang.
- `database/README.md` ghi lại schema PostgreSQL (host bởi Supabase)
  và vị trí migration dự định cho tương lai.

Không có tính năng tính toán, schema database, hay CRUD nào được đưa
vào trong thay đổi này.
