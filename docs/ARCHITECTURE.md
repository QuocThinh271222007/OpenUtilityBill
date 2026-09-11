# Kiến trúc

Tài liệu này giải thích OpenUtilityBill được tổ chức như thế nào, và vì
sao. Tài liệu được viết để chủ dự án dùng lại khi bảo vệ (phỏng vấn)
trực tiếp — mọi quyết định ở đây đều phải giải thích được, không chỉ là
"starter kit làm vậy nên tôi làm theo".

## 1. Modular Monolith

OpenUtilityBill được triển khai như **một** ứng dụng backend (một
process Node.js) và **một** ứng dụng frontend (một static build). Đây
là ý nghĩa của "monolith" ở đây: một hình thức triển khai, không phải
đánh giá về chất lượng code.

Bên trong, mã nguồn backend được tổ chức thành các **module** nhỏ, độc
lập theo domain nghiệp vụ:

```
backend/src/modules/
  health/
  property/
  room/
  meter-reading/
  tariff/
  invoice/
```

Đây là ý nghĩa của "modular": cách tổ chức mã nguồn nội bộ. Mỗi module
sở hữu route, controller, service, và repository riêng của nó. Các
module không được chạm vào phần nội bộ của nhau — nếu module A cần dữ
liệu thuộc về module B, nó gọi Service của B, không gọi trực tiếp
Repository của B.

### Vì sao không dùng microservices

Microservices nghĩa là nhiều process triển khai độc lập, có gọi mạng
giữa chúng, và cần hạ tầng (service discovery, message queue,
container) để điều phối. Với một dự án thi cá nhân, domain nhỏ và đã
hiểu rõ (tính hoá đơn tiện ích cho nhà trọ), chi phí đó không mang lại
lợi ích gì — nó chỉ thêm nhiều thành phần khó chạy, khó debug, và khó
giải thích khi bảo vệ trực tiếp. Modular Monolith mang lại cùng mức độ
tách biệt trách nhiệm nội bộ mà không cần độ phức tạp triển khai và
mạng đó. Xem `docs/LEARNING_NOTES.md` để biết thêm về đánh đổi này.

## 2. MVC, mở rộng thêm Service và Repository

MVC thuần (Model–View–Controller) không có chỗ rõ ràng cho các workflow
nghiệp vụ nhiều bước, hay để cô lập việc truy cập database. Dự án này
mở rộng MVC với hai tầng bổ sung:

| Tầng | Trách nhiệm | KHÔNG được làm |
|---|---|---|
| **View** | HTML, Bootstrap, CSS tự viết, TypeScript phía trình duyệt. Hiển thị dữ liệu, thu thập input, gọi REST API. | Không bao giờ chạy SQL hay nói chuyện trực tiếp với database. |
| **Controller** | Nhận HTTP request, parse nó, gọi một Service, dịch `Result` trở lại thành HTTP response. | Không có công thức tính toán. Không có SQL thô. |
| **Service / Orchestrator** | Điều phối một workflow nghiệp vụ: quyết định thứ tự gọi, gọi các business module và Repository. | Không bao giờ render HTML hay chạm vào object `Request`/`Response`. |
| **Repository** | Sở hữu việc truy cập database; chứa hoặc gọi SQL. | Không bao giờ chứa business/calculation logic. |
| **Model / Types** | Hình dạng dữ liệu domain và các hợp đồng (ví dụ `Result<T>`). | — |
| **Calculation Core** | Các hàm TypeScript thuần cho phép tính biểu giá/định mức/hoá đơn. | Không phụ thuộc Express, HTML, hay Supabase. |

### Vì sao Service tồn tại

Nếu không có tầng Service, Controller sẽ phải làm cả validate, tra cứu
database, và tính toán cùng lúc — "ví dụ xấu" được mô tả trong đề bài
dự án. Việc duy nhất của một Service là quyết định *cái gì xảy ra theo
thứ tự nào*. Điều này giữ Controller mỏng (chỉ lo HTTP) và giữ logic
tính toán có thể unit-test độc lập mà không cần chạy HTTP server.

### Vì sao Repository tồn tại

Repository cô lập SQL và các chi tiết truy cập đặc thù của Supabase
đằng sau một tập hàm nhỏ, đặt tên theo đúng mục đích (ví dụ
`findRoomById`). Điều này có nghĩa:

- Business logic không bao giờ phụ thuộc vào *cách* dữ liệu được lưu.
- Công nghệ database có thể đổi mà không cần chạm vào Service hay
  Controller.
- SQL có thể review tập trung tại một chỗ cho mỗi domain, thay vì rải
  rác khắp các Controller.

### Vì sao Calculation Core được cô lập

Phép tính biểu giá điện/nước là giá trị cốt lõi của ứng dụng này. Nó
phải test được độc lập và giải thích được độc lập — không cần một
Express server, một kết nối database, hay một trình duyệt để chạy hay
kiểm chứng. Đây là lý do Calculation Core là các hàm TypeScript thuần,
không phụ thuộc `express`, HTML, hay thư viện client Supabase nào.

## 3. Luồng request

```
Người dùng
 ↓
View (HTML + Bootstrap)
 ↓
Frontend TypeScript (api/ → controllers/ → views/)
 ↓
REST API  (fetch tới /api/v1/...)
 ↓
Route            (backend/src/modules/<module>/<module>.routes.ts)
 ↓
Controller       (backend/src/modules/<module>/<module>.controller.ts)
 ↓
Service / Orchestrator   (backend/src/modules/<module>/<module>.service.ts)
 ├── Calculation Core (hàm thuần — backend/src/calculation/)
 ├── Repository (backend/src/repositories/)
 └── InvoiceUnitOfWork (backend/src/repositories/invoice-unit-of-work.ts,
     bọc đường ghi transactional cho CreateInvoice)
          ↓
       PostgreSQL (Supabase)
```

Ghi chú: mọi domain module đều cài đặt đầy đủ chuỗi này — `<module>
.routes.ts` → `<module>.controller.ts` → `<module>...service.ts` →
Repository/Calculation Core (+ `InvoiceUnitOfWork`/
`ElectricityTariffUnitOfWork` ở nơi một aggregate cần ghi nguyên tử)
→ PostgreSQL. Invoice (`POST`/`GET /api/v1/invoices`, xem
`docs/API.md`, `docs/CREATE_INVOICE_WORKFLOW.md`) và các module quản lý
— property, room, meter-reading, tariff (điện + nước), xem
`docs/MANAGEMENT_API.md` — đều theo đúng hình dạng này. Mỗi Controller
phụ thuộc Service của nó qua một factory nhỏ `getService: () =>
Service` (dependency injection), và mỗi Service cụ thể chạy trên
Postgres được lắp ráp bởi composition root riêng dưới
`backend/src/composition/` (một file mỗi module), không bao giờ do bản
thân Controller lắp ráp. `backend/src/shared/http/` và
`backend/src/shared/validation/` chứa các tiện ích nhỏ (parse ngày, ánh
xạ mã lỗi→HTTP status, kiểm tra hình dạng ID/scale thập phân) dùng
chung cho tất cả các module này, được tách ra khỏi module invoice khi
có consumer thứ hai cần cùng logic — xem `docs/MANAGEMENT_API.md` mục
"Ghi chú kiến trúc riêng cho quản lý" để biết danh sách đầy đủ. DELETE
CỐ Ý chưa được cài đặt cho bất kỳ tài nguyên quản lý nào (xem mục
"Không có endpoint DELETE" trong tài liệu đó) — đây không phải một lỗ
hổng trong chuỗi trên, mà là một quyết định về phạm vi.

Ví dụ cụ thể đã cài đặt — health check:

```
Trình duyệt
 ↓
frontend/src/controllers/status.controller.ts
 ↓ gọi
frontend/src/api/health.api.ts  →  fetch("/api/v1/health")
 ↓
backend/src/modules/health/health.routes.ts
 ↓
backend/src/modules/health/health.controller.ts
 ↓
backend/src/modules/health/health.service.ts
 ↓
trả về Result<HealthStatus> → Controller ánh xạ nó thành HTTP JSON
```

## 4. Hướng phụ thuộc

Phụ thuộc chỉ được phép trỏ "xuống dưới":

```
Route → Controller → Service → Business Module / Repository → Database
```

Các hướng bị cấm tường minh (xem quy tắc dự án trong `README.md`):

- Repository → Controller
- Calculation → Express
- Calculation → Supabase
- Database → View

Không cho phép phụ thuộc vòng tròn giữa các module hay các tầng. Nếu
hai module có vẻ cần lẫn nhau, logic dùng chung nên được tách ra thành
một module thứ ba mà cả hai cùng phụ thuộc, hoặc workflow nên được mô
hình hoá lại ở tầng Service.

## 5. Ranh giới REST

- Mọi endpoint backend đều versioned dưới `/api/v1`.
- Request và response đều là JSON.
- Mọi response tuân theo hợp đồng thành công/lỗi được mô tả ở
  `docs/ERROR_HANDLING.md`.
- Frontend không bao giờ giả định một hình dạng response ngoài hợp
  đồng đó.

## 6. Ranh giới database

- Database là PostgreSQL, host bởi Supabase.
- Truy cập bằng SQL trực tiếp qua client **Postgres.js** (không ORM) —
  xem `docs/LEARNING_NOTES.md` và `docs/DATABASE_ACCESS.md` để biết vì
  sao.
- Mọi truy cập database được cô lập đằng sau interface Repository
  (`backend/src/repositories/*.repository.ts`) với implementation
  Postgres dưới `backend/src/repositories/postgres/`. Controller và
  Service không bao giờ import Postgres.js trực tiếp, và Calculation
  Core không bao giờ import bất kỳ code database nào.
- Adapter kết nối (`backend/src/database/postgres-client.ts`) và ranh
  giới transaction (`backend/src/database/transaction.ts`) là NƠI DUY
  NHẤT một client Postgres.js được tạo ra — xem
  `docs/DATABASE_ACCESS.md`.
- Schema: `database/migrations/001_initial_domain_schema.sql` và
  `002_preserve_invoice_item_precision.sql` — xem `database/README.md`.

## 7. Vì sao module cố ý được giữ nhỏ

Một module ở đây nghĩa là "một trách nhiệm, một đầu vào rõ ràng, một
đầu ra rõ ràng, một đường thành công/thất bại rõ ràng" — không phải
"một handler khổng lồ làm mọi thứ". Ví dụ trong đề bài dự án
(`ValidateInvoiceInput`, `LoadRoom`, `CalculateElectricityTax`, v.v.)
chính là hình dạng dự định cho phần tính toán hoá đơn. Module nhỏ thì:

- Dễ unit-test độc lập hơn.
- Dễ giải thích riêng lẻ khi review hay bảo vệ trực tiếp hơn.
- Dễ thay đổi mà không phá vỡ logic không liên quan hơn.

## 8. Module và Service — thuật ngữ dùng trong dự án này

- **Module** (thư mục dưới `backend/src/modules/`): một nhóm domain
  nghiệp vụ (ví dụ `health`, `room`, `tariff`). Chứa route/controller/
  service/repository riêng của nó.
- **Service** (file `.service.ts` bên trong một module): tầng điều
  phối cho các workflow của module đó. "Service" luôn chỉ tầng cụ thể
  này, không phải cả module.

Gọi cả một module là "service" (như trong "microservice") sẽ gây hiểu
lầm trong dự án này, vì các module không được triển khai độc lập.
