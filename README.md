# OpenUtilityBill

[![CI](https://github.com/QuocThinh271222007/OpenUtilityBill/actions/workflows/ci.yml/badge.svg)](https://github.com/QuocThinh271222007/OpenUtilityBill/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![SPDX-License-Identifier](https://img.shields.io/badge/SPDX--License--Identifier-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20%20(CI)-brightgreen.svg)](docs/DEVELOPMENT.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](https://www.typescriptlang.org/)
[![FOSS](https://img.shields.io/badge/FOSS-compliant-blue.svg)](THIRD_PARTY_NOTICES.md)

Ứng dụng web mã nguồn mở giúp tính toán và đối chiếu chi phí điện/nước
cho nhà trọ một cách minh bạch.

## Giới thiệu

Người thuê trọ thường khó kiểm chứng cách hoá đơn điện/nước được tính
(phân bổ theo bậc, quy tắc định mức, thuế/phí và biểu giá áp dụng).
OpenUtilityBill hướng tới việc làm cho phép tính đó minh bạch, có thể
giải thích từng bước và kiểm tra lại độc lập:

- Tính chi phí điện và nước từ chỉ số công tơ và biểu giá đã cấu hình.
- Giải thích từng bước của phép tính hoá đơn, không chỉ đưa ra con số cuối cùng.
- Đối chiếu số tiền thực thu với chi phí được tính theo biểu giá và quy tắc cấu hình.

## Tính năng chính

- **Quản lý cơ sở/phòng**: tạo và sửa cơ sở cho thuê (`RentalProperty`)
  và từng phòng (`Room`), bao gồm số người ở hiện tại.
- **Ghi chỉ số công tơ**: nhập chỉ số điện/nước theo từng kỳ (tháng),
  hỗ trợ trường hợp công tơ tràn số (rollover) khi có giá trị tối đa.
- **Cấu hình biểu giá**: biểu giá điện dạng bậc thang với số bậc động
  cùng phương pháp fallback, và biểu giá nước với hai phương pháp tính
  (theo m³ hoặc theo số người).
- **Tạo và đọc lại hoá đơn**: tính hoá đơn theo Calculation Core, lưu
  breakdown chi tiết từng dòng, và đọc lại hoá đơn lịch sử mà không
  tính lại.
- **Đối chiếu thực thu — hợp pháp**: nhập số tiền thực tế đã thu và so
  sánh với tổng đã tính theo cấu hình hợp lệ.
- **Độ chính xác tài chính**: các giá trị tài chính/đo lường được xử lý
  dưới dạng chuỗi thập phân chính xác (`BigInt` ở Calculation Core,
  `NUMERIC`/`string` xuyên suốt database → API → frontend), không dùng
  floating-point cho phép tính tiền.

Xác thực, phân quyền theo vai trò, khu vực quản trị người dùng riêng và
triển khai production hiện chưa được cài đặt; xem mục **Ghi chú mở rộng
trong tương lai** ở cuối tài liệu.

## Kiến trúc hệ thống

- **Modular Monolith**: một backend triển khai duy nhất, được tổ chức
  nội bộ thành các module nghiệp vụ nhỏ (`property`, `room`,
  `meter-reading`, `tariff`, `invoice`).
- **Hướng MVC mở rộng**: Route → Controller → Service → Repository;
  Controller không chứa business logic hoặc SQL.
- **Calculation Core**: TypeScript thuần, độc lập với Express, HTML và
  Supabase; thực hiện phép tính sản lượng công tơ, tiền điện theo bậc/
  fallback, tiền nước và tổng hoá đơn.
- **Hợp đồng Result**: business logic trả về `{ success, data }` hoặc
  `{ success: false, error: { code, message } }`, giúp luồng lỗi rõ ràng
  và fail-fast.
- **Composition root theo module**: mỗi module nối Service thật với
  Repository thật trong `backend/src/composition/`.

Chi tiết: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

### Sơ đồ kiến trúc

```mermaid
flowchart TB
    subgraph Browser["Trình duyệt"]
        FE["Frontend SPA<br/>Vite + TypeScript + Bootstrap"]
    end

    subgraph Backend["Backend - Node.js + TypeScript + Express"]
        API["Route / Controller<br/>(backend/src/modules/*/*.controller.ts)"]
        SVC["Service<br/>(CreateInvoiceService, GetInvoiceService,<br/>*ManagementService)"]
        CALC["Calculation Core<br/>(backend/src/calculation/)<br/>thuần TypeScript, không phụ thuộc DB/HTTP"]
        REPO["Repository / Unit of Work<br/>(backend/src/repositories/postgres/)"]
    end

    DB[("PostgreSQL<br/>được host bởi Supabase")]

    FE -- "fetch /api/v1/..." --> API
    API --> SVC
    SVC --> CALC
    SVC --> REPO
    REPO -- "SQL tham số hoá qua Postgres.js" --> DB
    API -- "JSON: success/data hoặc error" --> FE
```

## Luồng dữ liệu chính

### Luồng tạo hóa đơn

```mermaid
sequenceDiagram
    actor U as Người dùng
    participant FE as Frontend (invoice.controller.ts)
    participant C as invoice.controller.ts (backend)
    participant S as CreateInvoiceService
    participant R as Repository (Room/MeterReading/Tariff)
    participant CC as Calculation Core
    participant UOW as InvoiceUnitOfWork
    participant DB as PostgreSQL

    U->>FE: Chọn phòng, kỳ hoá đơn, phương pháp tính điện/nước
    FE->>C: POST /api/v1/invoices
    C->>S: execute(input)
    S->>R: Đọc Room, MeterReading, Tariff áp dụng
    R->>DB: SELECT tham số hoá
    DB-->>R: Dữ liệu thô (NUMERIC dưới dạng string)
    R-->>S: Room / MeterReading / Tariff
    S->>CC: Tính sản lượng, tiền điện, tiền nước, tổng hoá đơn
    CC-->>S: Breakdown chính xác
    S->>UOW: run(createInvoice + createInvoiceItems)
    UOW->>DB: BEGIN ... INSERT invoice, INSERT invoice_items ... COMMIT
    DB-->>UOW: Invoice đã lưu
    UOW-->>S: Invoice + InvoiceItem[]
    S-->>C: CreateInvoiceResult
    C-->>FE: 201 - success true, data invoice/items/billingDifference
    FE-->>U: Hiển thị breakdown, tổng hợp pháp, đối chiếu thực thu
```

### Luồng quản lý biểu giá

```mermaid
sequenceDiagram
    actor U as Người dùng
    participant FE as Frontend (tariff.controller.ts)
    participant C as tariff.controller.ts (backend)
    participant S as Electricity/WaterTariffManagementService
    participant UOW as TariffUnitOfWork / Repository
    participant DB as PostgreSQL
    participant INV as CreateInvoiceService

    U->>FE: Mở màn hình Biểu giá, nhập cấu hình và các bậc giá
    FE->>C: POST hoặc PUT /api/v1/tariffs/electricity hoặc /water
    C->>S: create() hoặc update()
    S->>S: Validate cấu trúc bậc, tỷ lệ và khoảng hiệu lực
    S->>UOW: Lưu tariff và tiers trong transaction
    UOW->>DB: BEGIN ... INSERT hoặc UPDATE ... COMMIT
    DB-->>UOW: Tariff đã lưu
    UOW-->>S: ElectricityTariff hoặc WaterTariff (+ tiers)
    S-->>C: Result
    C-->>FE: 200/201 - success true, data

    Note over INV,DB: Khi tạo hoá đơn cho một billing period
    INV->>DB: Tìm tariff có khoảng hiệu lực phù hợp billingPeriod
    DB-->>INV: Trả đúng một tariff áp dụng hoặc lỗi cấu hình tương ứng
```

### Luồng dữ liệu frontend

```mermaid
flowchart LR
    V["View<br/>(views/*.view.ts)<br/>render DOM, escapeHtml"] -->|"sự kiện người dùng"| CT["Controller<br/>(controllers/*.controller.ts)<br/>điều phối theo màn hình"]
    CT -->|"gọi hàm"| APIM["API module<br/>(api/*.api.ts)"]
    APIM -->|"apiRequest() - fetch /api/v1/..."| BE["Backend REST API"]
    BE -->|"JSON: success/data hoặc error"| APIM
    APIM -->|"ApiResult<T>"| CT
    CT -->|"render lại với dữ liệu mới"| V
```

## Cấu trúc thư mục

```text
OpenUtilityBill/
  .github/workflows/   GitHub Actions CI
  backend/             REST API, Calculation Core, Repository, composition root
  frontend/            Vite + TypeScript + Bootstrap, controllers/views/api/utils
  database/            Migration, seed và SQL validation
  docs/                Tài liệu kiến trúc, API, database, frontend và vận hành
  CONTRIBUTING.md      Hướng dẫn đóng góp
  LICENSE              Giấy phép MIT
  README.md            Tổng quan dự án
```

## Công nghệ sử dụng

| Tầng | Công nghệ |
|---|---|
| Frontend | HTML5, TypeScript, Vite, Bootstrap |
| Backend | Node.js, TypeScript, Express |
| API | REST, JSON, versioned dưới `/api/v1` |
| Database | PostgreSQL, Supabase, Postgres.js, không ORM |
| CI | GitHub Actions (`.github/workflows/ci.yml`) |
| Quản lý mã nguồn | Git, Conventional Commits |

Xem [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) để biết package
bên thứ ba và giấy phép tương ứng.

## Bảng căn cứ pháp lý tham chiếu

Các quy tắc nghiệp vụ về điện trong OpenUtilityBill được tách khỏi mã
nguồn và lưu dưới dạng cấu hình để có thể cập nhật khi quy định thay
đổi. Bảng dưới đây tổng hợp các văn bản được nêu trong bộ tài liệu đầu
vào của dự án và cách chúng được phản ánh trong hệ thống.

| Văn bản | Hiệu lực / thời điểm áp dụng | Nội dung tham chiếu | Liên hệ trong OpenUtilityBill |
|---|---|---|---|
| **Quyết định số 1279/QĐ-BCT ngày 09/5/2025 của Bộ Công Thương** | Áp dụng từ **10/5/2025** | Giá bán lẻ điện sinh hoạt theo biểu giá bậc thang sáu bậc. | Biểu giá điện được mô hình hoá bằng `electricity_tariffs` và `electricity_tariff_tiers`; cấu hình mặc định gồm 6 bậc và có thể thay đổi mà không sửa Calculation Core. |
| **Thông tư số 60/2025/TT-BCT của Bộ Công Thương** | Hiệu lực từ **02/12/2025** | Quy định thực hiện giá bán điện đối với nhà cho thuê: định mức theo số người sử dụng điện; 4 người tương ứng 1 định mức, số người ít hơn được quy đổi theo tỷ lệ 1/4 định mức mỗi người; trường hợp không kê khai đầy đủ số người áp dụng giá bậc 3. | Calculation Core hỗ trợ phương pháp `QUOTA_TIERED`, hệ số định mức theo số người và phương án fallback theo bậc cấu hình; màn hình hoá đơn cho phép đối chiếu số tiền thực thu với số tiền tính theo cấu hình hợp lệ. |
| **Nghị định số 133/2026/NĐ-CP** | Hiệu lực từ **25/5/2026** | Căn cứ xử lý hành vi thu tiền điện cao hơn giá quy định và nghĩa vụ hoàn trả theo tài liệu tham chiếu. | Dự án dùng nội dung này làm bối cảnh cho chức năng đối chiếu thực thu; OpenUtilityBill **không** tự tính mức xử phạt hành chính. |
| **Nghị quyết số 204/2025/QH15** | Mức giảm thuế được tài liệu tham chiếu nêu áp dụng đến hết **31/12/2026** | Căn cứ cho mức giảm thuế giá trị gia tăng áp dụng trong giai đoạn tham chiếu. | Cấu hình mặc định sử dụng VAT điện **8%**; tỷ lệ VAT là dữ liệu cấu hình theo thời gian, không được hard-code vào Calculation Core. |

Đối với **nước sinh hoạt**, bộ tài liệu đầu vào nêu rõ giá nước do từng
địa phương ban hành nên có thể khác nhau giữa các tỉnh/thành. Vì vậy
OpenUtilityBill không coi một đơn giá nước duy nhất là mức pháp lý áp
dụng cho mọi nơi; giá theo m³, giá theo người, VAT và phí môi trường đều
được thiết kế dưới dạng tham số cấu hình.

> Bảng trên dùng để giải thích nguồn tham chiếu của các quy tắc và cấu
> hình trong phần mềm, không thay thế văn bản pháp luật gốc. Khi biểu giá,
> thuế hoặc quy định thay đổi, cần cập nhật cấu hình theo văn bản có hiệu
> lực tại thời điểm áp dụng.

## Hướng dẫn cài đặt & Chạy trên máy

Phần này dành cho người muốn tải mã nguồn và chạy OpenUtilityBill trên
máy cá nhân. `backend/` và `frontend/` là **hai package npm độc lập**;
repository không có `package.json` ở thư mục gốc, vì vậy cần cài dependency
và chạy lệnh trong đúng thư mục tương ứng.

### Yêu cầu trước khi cài đặt

- **Git** để clone repository.
- **Node.js 20 trở lên** và **npm**.
- Một database **PostgreSQL**. Có thể dùng Supabase như cấu hình tham chiếu
  của dự án; không bắt buộc phải cài PostgreSQL local nếu đã có database từ xa.
- Trình duyệt web hiện đại để sử dụng frontend.

Có thể kiểm tra nhanh môi trường bằng:

```bash
git --version
node --version
npm --version
```

### 1. Tải mã nguồn

```bash
git clone https://github.com/QuocThinh271222007/OpenUtilityBill.git
cd OpenUtilityBill
```

Sau khi clone, thư mục gốc tối thiểu phải có các thư mục:

```text
backend/
frontend/
database/
docs/
```

> Không chạy `npm install` ở thư mục gốc. Hãy chạy riêng trong
> `backend/` và `frontend/` như các bước bên dưới.

### 2. Chuẩn bị database PostgreSQL

OpenUtilityBill cần schema và dữ liệu cấu hình biểu giá trước khi các
endpoint nghiệp vụ có thể hoạt động. Chạy migration và seed theo đúng thứ
tự sau:

```text
1. database/migrations/001_initial_domain_schema.sql
2. database/migrations/002_preserve_invoice_item_precision.sql
3. database/seeds/001_default_tariffs.sql
```

#### Cách A — dùng Supabase SQL Editor

1. Tạo hoặc mở một project Supabase.
2. Mở **SQL Editor**.
3. Mở từng file SQL phía trên trong repository, copy toàn bộ nội dung và
   chạy theo đúng thứ tự `001 migration → 002 migration → seed`.
4. Mỗi bước phải hoàn tất không lỗi trước khi chạy bước tiếp theo.

Seed mặc định được thiết kế để có thể chạy lại mà không tạo thêm bản cấu
hình trùng. Hướng dẫn kiểm chứng database chi tiết hơn nằm tại
[`database/README.md`](database/README.md).

#### Cách B — dùng `psql`

Nếu máy đã có PostgreSQL client `psql` và đã có `DATABASE_URL`:

```bash
psql "$DATABASE_URL" -f database/migrations/001_initial_domain_schema.sql
psql "$DATABASE_URL" -f database/migrations/002_preserve_invoice_item_precision.sql
psql "$DATABASE_URL" -f database/seeds/001_default_tariffs.sql
```

Trên Windows PowerShell, có thể truyền connection string trực tiếp cho
`psql` nếu cần, nhưng **không lưu mật khẩu thật vào file đã commit**.

### 3. Thiết lập `DATABASE_URL` cho backend

File [`backend/.env.example`](backend/.env.example) chỉ mô tả các biến môi
trường mà backend sử dụng. Backend hiện **không dùng `dotenv` và không tự
động đọc `backend/.env`**; `DATABASE_URL` phải có mặt trong môi trường của
chính tiến trình Node.

Định dạng chung:

```text
postgresql://USER:PASSWORD@HOST:PORT/DATABASE
```

Hãy lấy connection string PostgreSQL từ nhà cung cấp database của bạn
(ví dụ Supabase) và chỉ đặt nó trong môi trường local.

**Windows PowerShell:**

```powershell
$env:DATABASE_URL = '<POSTGRESQL_DATABASE_URL>'
$env:PORT = '3000'   # tùy chọn; bỏ qua nếu dùng cổng mặc định 3000
```

Kiểm tra biến đã tồn tại mà không in credential thật:

```powershell
if ($env:DATABASE_URL) { "DATABASE_URL is set" } else { "DATABASE_URL is missing" }
```

**Bash / Linux / macOS:**

```bash
export DATABASE_URL='<POSTGRESQL_DATABASE_URL>'
export PORT=3000      # tùy chọn
```

Kiểm tra:

```bash
if [ -n "$DATABASE_URL" ]; then echo "DATABASE_URL is set"; else echo "DATABASE_URL is missing"; fi
```

Biến môi trường này chỉ tồn tại trong terminal/session nơi bạn đã đặt nó
(và các tiến trình con). Nếu mở terminal mới, hãy đặt lại trước khi chạy
backend.

> Không commit `DATABASE_URL`, mật khẩu database, Supabase service-role
> key hoặc secret thật vào repository.

### 4. Cài đặt và chạy backend

Từ thư mục gốc repository:

```bash
cd backend
npm install
npm run dev
```

`npm run dev` chạy Express backend bằng `tsx watch`, vì vậy source thay đổi
sẽ tự khởi động lại server trong quá trình phát triển.

Mặc định backend lắng nghe tại:

```text
http://localhost:3000
```

Mở terminal khác và kiểm tra health endpoint:

```bash
curl http://localhost:3000/api/v1/health
```

Kết quả mong đợi:

```json
{"success":true,"data":{"status":"ok"}}
```

`/api/v1/health` không truy cập database, vì vậy endpoint này vẫn có thể
trả `ok` khi chưa cấu hình `DATABASE_URL`. Các endpoint quản lý, biểu giá
và hóa đơn cần database đã được cấu hình đúng.

Nếu muốn chạy backend theo dạng build thay vì dev watcher:

```bash
npm run typecheck
npm run build
npm start
```

`npm run build` tạo JavaScript đã biên dịch trong `backend/dist/`; `npm
start` chạy `node dist/server.js`.

### 5. Cài đặt và chạy frontend

Giữ backend đang chạy. Mở **terminal thứ hai**, quay về thư mục gốc của
repository rồi chạy:

```bash
cd frontend
npm install
npm run dev
```

Vite sẽ in địa chỉ local ra terminal, thông thường là:

```text
http://localhost:5173
```

Mở địa chỉ đó trong trình duyệt. Ở chế độ development, Vite proxy mọi
request bắt đầu bằng `/api` tới backend tại `http://localhost:3000`, nên
không cần sửa URL API thủ công khi chạy theo cấu hình mặc định.

Nếu cổng `5173` đã được sử dụng, Vite có thể chọn một cổng trống khác;
hãy mở đúng URL được in trong terminal.

### 6. Kiểm tra nhanh sau khi cài đặt

Sau khi cả backend và frontend đang chạy:

1. Mở frontend trong trình duyệt.
2. Kiểm tra sidebar hiển thị trạng thái backend hoạt động.
3. Mở các màn hình **Cơ sở**, **Phòng**, **Ghi chỉ số**, **Hóa đơn** và
   **Biểu giá** để xác nhận dữ liệu có thể được tải.
4. Tạo dữ liệu thử theo thứ tự hợp lý: cơ sở → phòng → chỉ số công tơ →
   hóa đơn.
5. Nếu cần kiểm tra sâu hơn, dùng checklist tại
   [`docs/FINAL_SMOKE_CHECKLIST.md`](docs/FINAL_SMOKE_CHECKLIST.md).

### 7. Dừng và chạy lại ứng dụng

Nhấn `Ctrl + C` trong terminal backend/frontend để dừng từng tiến trình.
Khi chạy lại:

```bash
# terminal 1
cd backend
npm run dev

# terminal 2
cd frontend
npm run dev
```

Nếu terminal backend mới chưa có `DATABASE_URL`, đặt lại biến môi trường
trước `npm run dev`.

### Xử lý lỗi cài đặt thường gặp

| Hiện tượng | Nguyên nhân thường gặp | Cách kiểm tra / xử lý |
|---|---|---|
| `npm` báo không tìm thấy `package.json` | Đang chạy lệnh npm ở thư mục gốc hoặc sai thư mục. | Chạy backend trong `OpenUtilityBill/backend` và frontend trong `OpenUtilityBill/frontend`. |
| Health endpoint chạy nhưng màn hình không tải dữ liệu | `/health` không cần DB nhưng các Repository endpoint cần `DATABASE_URL`. | Kiểm tra `DATABASE_URL` trong **cùng terminal đang chạy backend** và kiểm tra migration/seed đã được áp dụng. |
| PostgreSQL báo `relation ... does not exist` | Schema chưa được tạo hoặc đang kết nối nhầm database. | Chạy lại migration 001, migration 002 và seed trên đúng database. |
| Frontend báo không kết nối được backend | Backend chưa chạy, dùng cổng khác hoặc tiến trình đã dừng. | Kiểm tra `http://localhost:3000/api/v1/health` và terminal backend. |
| Backend không dùng giá trị trong `backend/.env` | Đây là hành vi hiện tại theo thiết kế; project không tự load `.env`. | Đặt biến bằng `$env:DATABASE_URL=...` trên PowerShell hoặc `export DATABASE_URL=...` trên Bash trước khi chạy Node. |
| Một số integration test hiện `SKIP` | Không có `DATABASE_URL` trong môi trường test. | Đây là hành vi mong đợi; đặt `DATABASE_URL` tới database test đã migrate/seed nếu muốn chạy test PostgreSQL thật. |
| Cổng 3000 đã được sử dụng | Một tiến trình khác đang chiếm cổng mặc định. | Dừng tiến trình đó hoặc đặt biến `PORT` sang cổng khác; khi đổi cổng backend, cấu hình proxy frontend cũng phải được điều chỉnh tương ứng. |

Hướng dẫn phát triển và giải thích chi tiết từng lệnh nằm tại
[`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md). Hướng dẫn database chi tiết
nằm tại [`database/README.md`](database/README.md).

## Hướng dẫn chạy kiểm thử tự động

Backend và frontend là hai package npm độc lập, vì vậy chạy kiểm tra ở
đúng thư mục tương ứng.

### Backend

```bash
cd backend
npm install
npm run typecheck
npm run build
npm test
```

`npm test` chạy test backend bằng `node:test` qua `tsx`.

- Nếu **không** đặt `DATABASE_URL`, các integration test cần PostgreSQL
  thật sẽ tự động `SKIP`; các test không phụ thuộc database vẫn chạy.
- Nếu `DATABASE_URL` trỏ tới database kiểm thử đã có migration/seed phù
  hợp, toàn bộ integration test cũng được thực thi.
- Không dùng database production cho thao tác kiểm thử có khả năng tạo
  dữ liệu tạm nếu chưa kiểm tra rõ phạm vi của test.

### Frontend

Frontend hiện không có Jest/Vitest. Kiểm tra tự động ở mức compile/build:

```bash
cd frontend
npm install
npm run typecheck
npm run build
```

### GitHub Actions CI

Workflow [`ci.yml`](.github/workflows/ci.yml) được kích hoạt khi `push`
hoặc mở/cập nhật `pull_request`. Workflow thực hiện:

```text
Backend  → npm ci → typecheck → build → test
Frontend → npm ci → typecheck → build
```

CI không sử dụng `DATABASE_URL` thật, vì vậy các integration test cần
PostgreSQL sẽ tự `SKIP` trong môi trường này.

## Đóng góp

OpenUtilityBill chào đón các đóng góp về sửa lỗi, tài liệu, kiểm thử,
UI/UX và mở rộng chức năng.

Trước khi bắt đầu, vui lòng đọc [`CONTRIBUTING.md`](CONTRIBUTING.md) để
nắm quy trình branch/commit/Pull Request, yêu cầu kiểm thử và các ranh
giới kiến trúc cần giữ.

Nếu phát hiện lỗi hoặc muốn đề xuất thay đổi lớn, hãy sử dụng
[GitHub Issues](https://github.com/QuocThinh271222007/OpenUtilityBill/issues).

## Kiểm thử / CI

- **Backend**: test runner là `node:test` qua `tsx`; các test tích hợp
  PostgreSQL tự `SKIP` nếu `DATABASE_URL` không tồn tại.
- **Frontend**: `npm run typecheck` và `npm run build` là các kiểm tra
  compile-time hiện có.
- **CI**: workflow chạy trên `push` và `pull_request`; CI không thay thế
  kiểm thử click-through thủ công qua trình duyệt.
- **Browser smoke**: checklist nằm tại
  [`docs/FINAL_SMOKE_CHECKLIST.md`](docs/FINAL_SMOKE_CHECKLIST.md) và cần
  được thực hiện thủ công trước khi phát hành.

## Tài liệu chi tiết

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — kiến trúc và ranh giới module.
- [`docs/TECHNICAL_RATIONALE.md`](docs/TECHNICAL_RATIONALE.md) — cơ sở lựa chọn kỹ thuật.
- [`docs/ERROR_HANDLING.md`](docs/ERROR_HANDLING.md) — hợp đồng lỗi và fail-fast.
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — hướng dẫn phát triển chi tiết.
- [`docs/FRONTEND.md`](docs/FRONTEND.md) — kiến trúc frontend.
- [`docs/DOMAIN_MODEL.md`](docs/DOMAIN_MODEL.md) — mô hình domain.
- [`docs/DATABASE_DESIGN.md`](docs/DATABASE_DESIGN.md) — thiết kế schema.
- [`docs/TRANSACTIONS.md`](docs/TRANSACTIONS.md) — transaction và ACID.
- [`docs/CALCULATION_CORE.md`](docs/CALCULATION_CORE.md) — pipeline tính toán.
- [`docs/NUMERIC_PRECISION.md`](docs/NUMERIC_PRECISION.md) — độ chính xác số học.
- [`docs/DATABASE_ACCESS.md`](docs/DATABASE_ACCESS.md) — Postgres.js và Repository.
- [`docs/CREATE_INVOICE_WORKFLOW.md`](docs/CREATE_INVOICE_WORKFLOW.md) — workflow hoá đơn.
- [`docs/API.md`](docs/API.md) — hợp đồng REST hoá đơn.
- [`docs/MANAGEMENT_API.md`](docs/MANAGEMENT_API.md) — API quản lý.
- [`database/README.md`](database/README.md) — migration/seed/validation.
- [`docs/FINAL_SMOKE_CHECKLIST.md`](docs/FINAL_SMOKE_CHECKLIST.md) — browser smoke checklist.

## Giấy phép

MIT — xem [`LICENSE`](LICENSE). Các file mã nguồn giữ header
`SPDX-License-Identifier: MIT` theo quy ước hiện tại của repository.

## Ghi chú mở rộng trong tương lai

Các hạng mục sau hiện chưa được cài đặt:

- Xác thực và phân quyền theo vai trò.
- Khu vực quản trị/người dùng có kiểm soát quyền riêng biệt.
- Endpoint `DELETE` cho các tài nguyên có ràng buộc lịch sử.
- Triển khai production và continuous deployment (CD) tự động.
- Biểu đồ và số liệu phân tích tổng hợp.