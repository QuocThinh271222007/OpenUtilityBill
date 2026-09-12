# OpenUtilityBill

Ứng dụng web mã nguồn mở giúp tính toán và so sánh chi phí điện/nước
cho nhà trọ một cách minh bạch.

## Bài toán

Người thuê trọ thường không thể kiểm chứng cách hoá đơn điện/nước của
mình được tính ra (phân bổ theo bậc, quy tắc định mức, thuế/phí do chủ
trọ áp dụng). OpenUtilityBill hướng tới việc làm cho phép tính đó minh
bạch, có thể giải thích từng bước, và kiểm tra lại độc lập.

## Mục tiêu

- Tính chi phí điện và nước từ chỉ số công tơ và biểu giá đã công bố.
- Giải thích từng bước của phép tính hoá đơn, không chỉ đưa ra con số
  cuối cùng.
- Cho phép so sánh giữa các kỳ hoá đơn hoặc các kịch bản biểu giá khác
  nhau.

## Kiến trúc tổng quan

- **Modular Monolith**: một backend triển khai duy nhất, được tổ chức
  nội bộ thành các module nghiệp vụ nhỏ.
- **Hướng MVC**, mở rộng thêm tầng Service/Orchestrator và tầng
  Repository cô lập việc truy cập database.
- **Calculation Core**: TypeScript thuần, độc lập với Express, HTML, và
  Supabase — thực hiện phép tính sản lượng công tơ, tiền điện theo bậc/
  fallback, tiền nước, và tổng hoá đơn, đã cài đặt và unit-test độc lập
  (xem [`docs/CALCULATION_CORE.md`](docs/CALCULATION_CORE.md)).
- **Hợp đồng Result**: business logic trả về `{ success, data }` hoặc
  `{ success: false, error: { code, message } }` thay vì throw hay trả
  `false`, giúp lỗi được lan truyền theo kiểu fail-fast.

Chi tiết đầy đủ: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Công nghệ sử dụng

| Tầng | Công nghệ |
|---|---|
| Frontend | HTML5, TypeScript, Vite, Bootstrap |
| Backend | Node.js, TypeScript, Express |
| API | REST, JSON, versioned dưới `/api/v1` |
| Database | PostgreSQL, host bởi Supabase (SQL trực tiếp qua Postgres.js, không ORM) |
| Quản lý mã nguồn | Git, Conventional Commits |

Xem [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) để biết chính
xác các package bên thứ ba đang dùng và giấy phép của chúng.

## Trạng thái hiện tại

Calculation Core đã cài đặt và test độc lập đầy đủ: sản lượng công tơ
(bao gồm cả trường hợp tràn số/rollover), phân bổ bậc giá có điều chỉnh
theo định mức, cả hai phương pháp tính điện (`QUOTA_TIERED`,
`FALLBACK_TIER_FLAT`), cả hai phương pháp tính nước
(`PER_CUBIC_METER`, `PER_PERSON`), tính tổng hoá đơn, và so sánh với số
tiền thực thu — toàn bộ là TypeScript thuần, dùng số học phân số chính
xác dựa trên `BigInt` (không bao giờ dùng dấu phẩy động) cho mọi giá
trị tài chính, không phụ thuộc database hay HTTP. Xem
[`docs/CALCULATION_CORE.md`](docs/CALCULATION_CORE.md) và
[`docs/NUMERIC_PRECISION.md`](docs/NUMERIC_PRECISION.md).

Nền tảng persistence đã có đầy đủ: một adapter database Postgres.js và
ranh giới transaction (`backend/src/database/`), cùng các Repository
implementation cho `RentalProperty`, `Room`, `MeterReading`,
`ElectricityTariff` (kèm các bậc giá), `WaterTariff`, và `Invoice` —
mỗi Repository đều hỗ trợ cả đọc VÀ ghi
(`backend/src/repositories/`) — toàn bộ dùng SQL tham số hoá, không
ORM, `NUMERIC` và `BIGINT` được giữ nguyên dưới dạng chuỗi chính xác từ
đầu đến cuối. Xem [`docs/DATABASE_ACCESS.md`](docs/DATABASE_ACCESS.md).

Luồng ghi hoá đơn đã cài đặt đầy đủ: `CreateInvoiceService`
(`backend/src/modules/invoice/`) điều phối việc đọc Room/MeterReading/
Tariff, gọi Calculation Core, và dùng `InvoiceUnitOfWork` (transaction)
để lưu một hoá đơn cùng toàn bộ breakdown một cách nguyên tử, có bảo vệ
chống trùng lặp an toàn với race condition. `GetInvoiceService` đọc lại
một hoá đơn đã lưu (không tính lại). Xem
[`docs/CREATE_INVOICE_WORKFLOW.md`](docs/CREATE_INVOICE_WORKFLOW.md).

Toàn bộ REST API backend cốt lõi đã có đầy đủ: tạo/đọc lại hoá đơn
(`POST`/`GET /api/v1/invoices`) cùng các endpoint quản lý cho property,
room, meter reading, và cấu hình biểu giá điện/nước
(`docs/MANAGEMENT_API.md`) — đủ để một frontend quản lý toàn bộ dữ liệu
cần thiết và tạo/xem hoá đơn. Mỗi endpoint được nối theo Route →
Controller → Service, không có business logic hay SQL nào trong
Controller, và mỗi module có composition root lazy riêng
(`backend/src/composition/`) để `GET /api/v1/health` vẫn hoạt động dù
chưa cấu hình `DATABASE_URL`. DELETE CỐ Ý chưa được cài đặt cho bất kỳ
tài nguyên nào (xem `docs/MANAGEMENT_API.md` mục "Không có endpoint
DELETE"). Xem [`docs/API.md`](docs/API.md) và
[`docs/MANAGEMENT_API.md`](docs/MANAGEMENT_API.md).

Giao diện trình duyệt đã có đầy đủ: một single-page app Vite +
TypeScript + Bootstrap (`frontend/src/`) với router dựa trên hash tự
viết (không dùng thư viện router), bao phủ toàn bộ luồng nghiệp vụ —
tạo/sửa property và room, đặt số người ở, nhập và xem lại chỉ số công
tơ điện/nước hàng tháng, cấu hình biểu giá điện (số bậc linh hoạt, bất
kỳ số lượng nào) và biểu giá nước, tạo hoá đơn và xem breakdown đầy đủ,
nhập số tiền thực thu và xem so sánh hợp pháp-thực thu, và xem lại một
hoá đơn lịch sử đã tạo trước đó. Frontend không bao giờ tự tính tiền —
mọi giá trị tài chính/đo lường được xử lý dưới dạng `string` từ đầu đến
cuối, khớp với hợp đồng `NUMERIC`-dưới-dạng-chuỗi của backend, và định
dạng VND chỉ để hiển thị được thực hiện bằng thao tác chuỗi, không bao
giờ ép kiểu qua `number` của JS. Xem
[`docs/FRONTEND.md`](docs/FRONTEND.md).

Giao diện quản lý, bao gồm cấu hình biểu giá điện/nước, đã được cài
đặt (xem ở trên). Xác thực, phân quyền theo vai trò, một khu vực quản
trị/người dùng riêng có kiểm soát quyền, và triển khai lên môi trường
production chưa được cài đặt — đây là các hạng mục riêng, sẽ thực
hiện sau, cần được xem xét độc lập.

**Bằng chứng runtime thật:** toàn bộ backend đã được chạy thật với kết
nối PostgreSQL thật (Supabase) — hành vi `NUMERIC`/`BIGINT` của
Postgres.js, commit/rollback transaction, đọc/ghi Repository, và
`POST`/`GET /api/v1/invoices` qua HTTP thật — đều đã được kiểm chứng
bằng thực thi thật, không chỉ suy đoán. Kết quả: 320/320 test PASS,
0 FAIL, 0 SKIP (không còn test tích hợp database nào bị bỏ qua). Kiểm
thử click-through thủ công qua trình duyệt vẫn chưa được xác nhận —
xem [`docs/FINAL_SMOKE_CHECKLIST.md`](docs/FINAL_SMOKE_CHECKLIST.md).

## Cấu trúc repository

```
OpenUtilityBill/
  backend/     REST API Node.js + TypeScript + Express, domain model,
               Calculation Core (backend/src/calculation/), adapter
               database (backend/src/database/), tầng Repository
               (backend/src/repositories/), và composition root nối
               Service thật với Repository thật
               (backend/src/composition/)
  frontend/    Client Vite + TypeScript + Bootstrap — api/ (gọi REST),
               types/ (mirror hợp đồng dữ liệu), utils/ (hàm hiển thị/
               độ chính xác thuần), controllers/ (điều phối theo từng
               màn hình), views/ (render DOM), và một router hash nhỏ
               tự viết (frontend/src/controllers/
               navigation.controller.ts)
  database/    Schema PostgreSQL (migrations/), dữ liệu seed (seeds/),
               và SQL kiểm chứng runtime (validation/)
  docs/        Tài liệu kiến trúc, domain model, truy cập database,
               tính toán, API/API quản lý, và cơ sở lựa chọn kỹ thuật
```

## Bắt đầu nhanh

Xem [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) để biết lệnh cài đặt,
chạy, build, và typecheck cho cả `backend/` và `frontend/`.

## Tài liệu

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — kiến trúc, luồng
  request, hướng phụ thuộc, ranh giới module.
- [`docs/TECHNICAL_RATIONALE.md`](docs/TECHNICAL_RATIONALE.md) — cơ sở
  lựa chọn kỹ thuật và kiến trúc cho từng công nghệ trong dự án.
- [`docs/ERROR_HANDLING.md`](docs/ERROR_HANDLING.md) — hợp đồng thành
  công/thất bại, mã lỗi, pipeline fail-fast.
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — cài đặt và các lệnh.
- [`docs/FRONTEND.md`](docs/FRONTEND.md) — kiến trúc frontend, sơ đồ
  màn hình/điều hướng, ranh giới API-client, quy tắc chuỗi tài chính,
  chuyển đổi month↔billingPeriod, và những gì thực sự đã được test
  runtime.
- [`docs/DOMAIN_MODEL.md`](docs/DOMAIN_MODEL.md) — các thực thể nghiệp
  vụ, quan hệ giữa chúng, và nguyên tắc snapshot lịch sử.
- [`docs/DATABASE_DESIGN.md`](docs/DATABASE_DESIGN.md) — lý do thiết kế
  schema: chuẩn hoá, khoá, ràng buộc, `NUMERIC` so với `FLOAT`.
- [`docs/TRANSACTIONS.md`](docs/TRANSACTIONS.md) — đảm bảo ACID và
  ranh giới transaction cho các luồng ghi.
- [`docs/CALCULATION_CORE.md`](docs/CALCULATION_CORE.md) — pipeline
  tính toán hoá đơn, trách nhiệm từng module, thiết kế fail-fast.
- [`docs/NUMERIC_PRECISION.md`](docs/NUMERIC_PRECISION.md) — vì sao
  dùng số học phân số chính xác dựa trên `BigInt` thay vì dấu phẩy
  động.
- [`docs/DATABASE_ACCESS.md`](docs/DATABASE_ACCESS.md) — Postgres.js,
  ranh giới Repository, query tham số hoá, transaction, và ranh giới độ
  chính xác `NUMERIC`/`BIGINT` tại adapter database.
- [`docs/CREATE_INVOICE_WORKFLOW.md`](docs/CREATE_INVOICE_WORKFLOW.md)
  — trình tự `CreateInvoiceService`/`GetInvoiceService`: đọc dữ liệu,
  tính toán, ghi transactional, chống trùng lặp/race condition, nguyên
  tắc snapshot hoá đơn, đọc lại dữ liệu đã lưu.
- [`docs/API.md`](docs/API.md) — hợp đồng REST cho
  `POST`/`GET /api/v1/invoices`: hình dạng request/response, định dạng
  ngày `YYYY-MM-DD`, hợp đồng chuỗi thập phân tài chính, ánh xạ HTTP
  status, và composition database lazy.
- [`docs/MANAGEMENT_API.md`](docs/MANAGEMENT_API.md) — hợp đồng REST
  cho quản lý property/room/meter-reading/tariff: hợp đồng số/ngày theo
  từng tài nguyên, chống trùng lặp/chồng lấn, bảo vệ tham chiếu lịch sử
  (vì sao một meter reading hay tariff đã được tham chiếu không thể
  sửa), và vì sao chưa cài đặt DELETE.
- [`database/README.md`](database/README.md) — các file schema/seed và
  cách chạy chúng.
- [`docs/FINAL_SMOKE_CHECKLIST.md`](docs/FINAL_SMOKE_CHECKLIST.md) —
  checklist smoke test thủ công trên trình duyệt, cần thực hiện trước
  khi phát hành.

## Giấy phép

MIT — xem [`LICENSE`](LICENSE).
