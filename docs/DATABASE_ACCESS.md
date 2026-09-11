# Truy cập Database

Tài liệu này giải thích cách backend nói chuyện với PostgreSQL: thư
viện client, ranh giới Repository, mô hình bảo mật, hợp đồng độ chính
xác (`NUMERIC`, `BIGINT`), transaction, và xử lý lỗi. Tài liệu bổ sung
cho [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) (tầng này nằm ở đâu),
[`docs/DATABASE_DESIGN.md`](DATABASE_DESIGN.md) (bản thân schema), và
[`docs/ERROR_HANDLING.md`](ERROR_HANDLING.md) (hợp đồng `Result<T>`
tầng này dùng lại).

## Vì sao Postgres.js, và vì sao không dùng ORM

Chủ dự án đã duyệt tường minh: PostgreSQL host bởi Supabase, truy cập
qua **Postgres.js** (package npm `postgres`) với **SQL tham số hoá trực
tiếp** — không ORM, không framework query-builder (Drizzle, Prisma,
TypeORM, Sequelize, Knex, Kysely).

Postgres.js là một *client* PostgreSQL — nó mở kết nối, gửi văn bản SQL
và tham số mà dự án này tự viết, và decode response. Nó không tự sinh
SQL từ một object model, không tự quản lý schema, và không áp đặt một
DSL query-building nào. Điều này khớp với nguyên tắc xuyên suốt dự án
(xem `docs/LEARNING_NOTES.md`) rằng chủ repository phải đọc và giải
thích được chính xác SQL nào đang chạy — với một ORM, SQL thực tế
thường được sinh gián tiếp và khó đoán trước hơn; với một client thuần
và SQL viết tay, câu query trong file nguồn *chính là* câu query sẽ
chạy.

## SQL trực tiếp không có nghĩa là SQL ở bất kỳ đâu

"SQL trực tiếp" mô tả *cách* một query được viết (viết tay, không sinh
tự động) — nó **không** có nghĩa là SQL được phép xuất hiện ở bất kỳ
đâu trong codebase. Hướng phụ thuộc vẫn nghiêm ngặt:

```
Controller  →  Service / Orchestrator  →  Repository interface
                       ↓                          ↓
                 Calculation Core       Postgres repository implementation
                                                   ↓
                                         Database adapter (Postgres.js)
                                                   ↓
                                          PostgreSQL / Supabase
```

- **Controller không bao giờ chứa SQL.** Nó parse input HTTP và gọi
  một Service.
- **Service không bao giờ chứa SQL.** Nó điều phối một workflow và gọi
  các interface Repository.
- **Calculation Core không bao giờ import code database.** Nó nhận dữ
  liệu như tham số hàm thuần (xem `docs/CALCULATION_CORE.md`).
- **SQL chỉ tồn tại dưới `backend/src/database/` và
  `backend/src/repositories/`** — điều này được kiểm chứng (xem mục
  "Kiểm chứng vị trí SQL" bên dưới).

## Ranh giới Repository

Mỗi domain có một **Repository interface** nhỏ, tường minh
(`backend/src/repositories/*.repository.ts`) mô tả *cái gì* có thể đọc
và ghi theo ngôn ngữ domain — ví dụ
`RoomRepository.findById(id): Promise<Result<Room>>`. Interface không
có SQL và không import Postgres.js. Mọi Repository nay đều có phương
thức ghi (`Property`, `Room`, `MeterReading`, `ElectricityTariff`,
`WaterTariff`, cộng thêm `Invoice`) — được thêm cho management API (xem
`docs/MANAGEMENT_API.md`); mỗi cái vẫn chỉ cài đặt đúng các thao tác
một use case thật cần (không có `delete` ở bất kỳ đâu, theo mục "Không
có endpoint DELETE" của tài liệu đó).

**Implementation Postgres**
(`backend/src/repositories/postgres/postgres-*.repository.ts`) là nơi
DUY NHẤT SQL cho domain đó tồn tại. Nó:

1. Chạy một query tham số hoá qua `DatabaseExecutor` được truyền vào
   constructor của nó.
2. Ánh xạ (các) dòng thô sang domain model sẵn có
   (`backend/src/modules/*/*.model.ts`) bằng một hàm mapper nhỏ, tường
   minh — không phải một thư viện ánh xạ tự động.
3. Dịch thất bại thành `Result<T>` (xem "Dịch lỗi" bên dưới).

Không có `GenericRepository<T>`/`BaseRepository` nào. Mỗi repository
chỉ có đúng các thao tác một use case thật, hiện tại cần — xem bảng
trong `README.md`/`CHANGELOG.md` để biết chính xác method nào tồn tại
và vì sao.

`InvoiceRepository` là repository có phương thức ghi
(`createInvoice`, `createInvoiceItems`), được thêm cho
`CreateInvoiceService` — xem `docs/CREATE_INVOICE_WORKFLOW.md`. Input
ghi dùng type riêng `NewInvoice`/`NewInvoiceItem`, không phải
`Omit<Invoice, ...>`/`Partial<Invoice>`, để hợp đồng ghi tự nó dễ đọc
thay vì phải suy ra từ model đọc. Nó cũng có thêm một phương thức đọc,
`findItemsByInvoiceId` (`ORDER BY display_order ASC`, tường minh —
không bao giờ dựa vào thứ tự hàng tự nhiên của PostgreSQL), được thêm
cho việc đọc lại invoice đã lưu của `GetInvoiceService` (`GET
/api/v1/invoices`, xem `docs/API.md`).

## Query tham số hoá (chống SQL injection)

Mọi giá trị động đều đi qua cơ chế thay thế tham số bằng tagged-template
của Postgres.js:

```ts
await sql<RoomRow[]>`
  SELECT id, property_id, name, tenant_count, created_at
  FROM rooms
  WHERE id = ${id}
`;
```

`${id}` được gửi tới PostgreSQL như một tham số bound, không được ghép
nối vào văn bản query — bản thân PostgreSQL giữ cấu trúc SQL và dữ liệu
hoàn toàn tách biệt, nên một giá trị như `id = "1; DROP TABLE rooms;"`
chỉ được coi là một chuỗi literal (không khớp), không bao giờ là cú
pháp SQL.

`sql.unsafe(...)` (nhận một chuỗi thô và bỏ qua bảo vệ này) **không
được dùng ở bất kỳ đâu** trong codebase này — xem kết quả kiểm chứng
trong báo cáo cuối của task đã đưa tầng này vào.

## Vòng đời kết nối

`backend/src/database/postgres-client.ts` tạo **một** client
Postgres.js (`postgres(connectionString)`) cho mỗi process, cache ở
phạm vi module, và mọi Repository dùng lại nó. Postgres.js tự quản lý
connection pool nội bộ bên trong một instance `Sql` đó — dự án này
**không** tự cài đặt một connection pool riêng; làm vậy sẽ lặp lại thứ
mà client đã làm đúng sẵn.

`closeDatabaseClient()` tồn tại để một đường tắt server hay một test có
thể đóng kết nối gọn gàng (không để lại "hanging connection" giữ
process test sống mãi). Nó được gọi **đúng một lần**, khi shutdown/dọn
dẹp — không bao giờ sau mỗi query đơn lẻ, vì làm vậy sẽ phá hỏng mục
đích dùng lại kết nối.

## Transaction

`backend/src/database/transaction.ts` export `runInTransaction`, một
wrapper mỏng bọc quanh `sql.begin()` của Postgres.js:

```ts
const result = await runInTransaction(async (tx) => {
  await tx`INSERT INTO ...`;
  await tx`INSERT INTO ...`;
  return ok(someValue);
});
```

Mọi thao tác ghi bên trong `work` **phải** dùng tham số `tx` nó nhận
được — không phải client toàn cục từ `getDatabaseClient()` — để mọi
thao tác ghi trong một hành động logic dùng chung đúng một transaction
database thật. Nếu `work` trả về một `Result` thất bại,
`runInTransaction` tự throw nội bộ để buộc Postgres.js rollback, rồi
chuyển nó trở lại thành cùng `Result` thất bại đó tại ranh giới — caller
chỉ bao giờ thấy `Result<T>`, không bao giờ thấy một lỗi throw thô, cho
đường thất bại đã lường trước.

**Quy tắc phạm vi transaction:** Calculation Core phải chạy *trước* khi
`runInTransaction` được gọi, không phải bên trong nó. Hình dạng này nay
đã được `CreateInvoiceService`
(`backend/src/modules/invoice/create-invoice.service.ts`) cài đặt — xem
`docs/CREATE_INVOICE_WORKFLOW.md`:

```
đọc dữ liệu bắt buộc (Repository đọc)
        ↓
validate + tính toán (Calculation Core — thuần, không I/O)
        ↓
BEGIN  (runInTransaction, qua InvoiceUnitOfWork)
  insert invoice
  insert invoice_items
COMMIT
```

Giữ một transaction database mở trong lúc làm việc tính toán tốn CPU sẽ
chặn một kết nối một cách vô ích — transaction chỉ nên bọc quanh các
thao tác ghi.

**`InvoiceUnitOfWork`** (`backend/src/repositories/invoice-unit-of-work.ts`,
implementation Postgres
`backend/src/repositories/postgres/postgres-invoice-unit-of-work.ts`) là
một interface nhỏ — một phương thức, `run(work)` — che giấu
`runInTransaction`/`DatabaseExecutor`/`PostgresInvoiceRepository` khỏi
`CreateInvoiceService`. Implementation Postgres dựng một
`PostgresInvoiceRepository` gắn với transaction context và truyền nó
vào `work`, để `createInvoice` và `createInvoiceItems` luôn chạy trên
CÙNG một transaction. Đây cố ý không phải một framework Unit-of-Work
tổng quát (không hỗ trợ nhiều repository, không có transaction lồng
nhau) — `CreateInvoice` là workflow ghi duy nhất tồn tại ở tầng này
(`ElectricityTariffUnitOfWork` là một Unit-of-Work riêng, độc lập, cho
việc cấu hình biểu giá điện — xem `docs/TRANSACTIONS.md` mục C).

Cơ chế này đã được kiểm chứng bằng assertion commit/rollback THẬT trên
PostgreSQL trong
`backend/src/database/__tests__/transaction.integration.test.ts` — và
đã thực sự chạy thật (`TRANSACTION_COMMIT_RUNTIME=PASS`,
`TRANSACTION_ROLLBACK_RUNTIME=PASS`) trong lần chạy runtime closure gần
nhất, không chỉ tồn tại dưới dạng code chưa chạy.

## Ranh giới độ chính xác `NUMERIC` / `BIGINT`

Dự án này đã đóng hợp đồng độ chính xác của Calculation Core
(`docs/NUMERIC_PRECISION.md`): giá trị tài chính/đo lường không bao giờ
được đi qua dấu phẩy động IEEE-754. Đảm bảo đó chỉ thật sự đúng nếu
adapter database cũng giữ nguyên giá trị chính xác — nên điều này đã
được **kiểm chứng**, không chỉ giả định:

- `node_modules/postgres/src/types.js` chỉ đăng ký parser cho OID
  `21, 23, 26, 700, 701` (`int2`, `int4`, `oid`, `float4`, `float8`)
  dưới nhãn `number` của nó. **`NUMERIC` (OID `1700`) và `BIGINT`/`int8`
  (OID `20`) không có parser đăng ký.**
- `node_modules/postgres/src/connection.js` mặc định trả nguyên văn
  chuỗi UTF-8 trên wire (tức một `string` JS thuần) cho bất kỳ cột nào
  có kiểu không có parser đăng ký.
- README của chính Postgres.js xác nhận tường minh: *"There is
  currently no guaranteed way to handle numeric / decimal types in
  native Javascript. These [and similar] types will be returned as a
  string."* và *"[bigint] doesn't work with `JSON.stringify` out of the
  box, so Postgres.js will return it as a string."* (trích nguyên văn
  từ README của thư viện — không dịch để giữ đúng nguồn tham chiếu.)

Vậy nên, **với zero cấu hình tuỳ biến**, Postgres.js đã trả về cột
`NUMERIC` và `BIGINT` dưới dạng chuỗi thập phân/số nguyên chính xác —
đúng hợp đồng ranh giới của dự án này. `postgres-client.ts` cố ý
**không** đăng ký một parser kiểu tuỳ biến cho cả hai, và ghi rõ vì sao
trong comment đầu file: làm vậy có nguy cơ đưa lại việc ép kiểu float/
number.

`backend/src/database/__tests__/postgres-client.numeric.integration.test.ts`
khẳng định điều này trên một kết nối PostgreSQL thật khi có sẵn —
`62.5125`, `124025.123456`, một `0.08` không khai báo scale, một biểu
thức `NUMERIC(p, s)` **scale cố định** (khớp cách các cột schema thật
được khai báo — ví dụ `NUMERIC(5, 4)` đọc lại là `"0.0800"`, không phải
`"0.08"`; xem "Định dạng chuỗi NUMERIC không được chuẩn hoá" bên dưới),
và giá trị BIGINT tối đa (`9223372036854775807`, vượt xa
`Number.MAX_SAFE_INTEGER`) đều được khẳng định round-trip đúng dưới
dạng chuỗi chính xác. Test này đã thực sự chạy thật trên PostgreSQL
thật trong lần chạy runtime closure gần nhất
(`POSTGRES_NUMERIC_RUNTIME=PASS`, `FIXED_SCALE_RUNTIME=PASS`,
`BIGINT_RUNTIME=PASS`).

### Định dạng chuỗi NUMERIC không được chuẩn hoá

Tầng Repository truyền qua nguyên vẹn bất kỳ chuỗi chính xác nào
PostgreSQL gửi — nó **không** định dạng lại nó (ví dụ cắt số 0 ở
cuối). `electricity_tariffs.electricity_vat_rate` là `NUMERIC(5, 4)`,
nên một dòng đọc từ nó có `electricityVatRate === "0.0800"`, không
phải `"0.08"` — cả hai chuỗi biểu diễn cùng một giá trị chính xác tuyệt
đối, và `parseDecimal` trong Calculation Core
(`docs/NUMERIC_PRECISION.md`) chấp nhận cả hai dạng như nhau. Đây là
một lựa chọn đơn giản có chủ đích, không phải một thiếu sót: chuẩn hoá
chuỗi thập phân sẽ có nghĩa là phải viết (và bảo trì) một hàm cắt số 0
trong tầng Repository mà không mang lại lợi ích đúng đắn nào —
Calculation Core đã chuẩn hoá bất kỳ chuỗi thập phân hợp lệ nào thành
một phân số chính xác đã rút gọn ngay khi nó parse, nên việc *định
dạng* chuẩn hoá chỉ có ý nghĩa ở ranh giới hiển thị/output cuối cùng,
nếu và khi cần, không phải ở ranh giới đọc của Repository.

Code ánh xạ dòng của Repository **không bao giờ** gọi `Number(...)`,
`parseFloat`, `parseInt`, hay dấu `+` đơn trên một cột dựa trên
`NUMERIC` hay `BIGINT` — điều này được kiểm chứng (xem báo cáo cuối).

## Ranh giới `BIGINT` / ID

Mọi cột `id` (và mọi khoá ngoại tham chiếu tới nó) đều là `BIGINT
GENERATED ALWAYS AS IDENTITY`. Một `number` của JS không thể biểu diễn
an toàn mọi giá trị `BIGINT` có thể có (khoảng an toàn là ±2^53−1;
`BIGINT` cho phép tới khoảng ±9.2×10^18). Âm thầm chuyển một ID sang
`number` và giả định "ID chắc sẽ luôn nhỏ" chính xác là kiểu giả định
chưa kiểm chứng mà dự án này tránh.

**Quyết định: mọi field ID đều là `string`** ở domain model và ranh
giới Repository (`RentalProperty.id`, `Room.id`, `Room.propertyId`,
v.v. — xem comment "Biểu diễn ID" của mỗi file model). Điều này khớp
với hành vi mặc định của chính Postgres.js với `BIGINT` (xem ở trên),
nên không có chuyển đổi nào xảy ra ở bất kỳ đâu trong tầng Repository —
chuỗi lấy ra từ wire chính là chuỗi được lưu trong domain object.

Điều này yêu cầu cập nhật các field `id`/`...Id` của domain model sẵn
có từ `number` sang `string` (một thay đổi tối thiểu, cơ học, một mục
đích duy nhất — không có field hay logic nào khác bị chạm vào).
`number` vẫn đúng cho các cột số nguyên không phải identity, là
`INTEGER` chứ không phải `BIGINT` (`tenant_count`, `tier_number`,
`people_per_quota_unit`, `fallback_tier_number`, `display_order`) —
các cột này nằm an toàn trong `number` và được giữ nguyên.

Không có `bigint` (kiểu nguyên thuỷ của JS) nào được dùng cho ID và
không có cái nào lộ ra trong một object hướng-JSON — ID là chuỗi thuần
từ đầu đến cuối, nên không cần chiến lược serialize đặc biệt nào (khác
với `ExactNumber`/`BigInt` nội bộ của Calculation Core, thứ không bao
giờ vượt qua ranh giới module — xem `docs/NUMERIC_PRECISION.md`).

## Ranh giới `DATE` — đã review, chưa thay đổi (cân nhắc tương lai)

`billing_period`, `effective_from`, và `effective_to` là cột `DATE`
của PostgreSQL (một ngày lịch, không có thành phần giờ hay timezone).
Tầng Repository hiện biểu diễn chúng dưới dạng object `Date` của JS,
khớp với domain model sẵn có (`docs/DOMAIN_MODEL.md`) và handler kiểu
`date` có sẵn của Postgres.js (OID `1082`/`1114`/`1184`, parse qua
`new Date(x)`).

Điều này đã được review cho một rủi ro cụ thể: Postgres.js serialize
một tham số `Date` JS đi ra dưới dạng `timestamptz` (OID `1184`, qua
`.toISOString()`), không phải dưới dạng `date`. Khi tham số đó được so
sánh với một cột `DATE` (ví dụ `WHERE billing_period = ${someDate}`),
PostgreSQL ép kiểu giá trị `date` của cột đó sang `timestamptz` dùng
**timezone của session** để so sánh — không nhất thiết là UTC. Nếu
timezone của session đó từng khác UTC, một `Date` dùng để biểu diễn
"2026-09-01" về lý thuyết có thể không khớp với một `billing_period`
là `2026-09-01`, hoặc khớp nhầm dòng, tuỳ theo offset.

**Đây là một rủi ro lý thuyết, không phải một bug đã chứng minh.**
Không có kết nối PostgreSQL sống nào để thực sự test điều này trong
các task đã xây dựng tầng này, và các database PostgreSQL host bởi
Supabase mặc định đặt timezone session là UTC, khiến đây không phải
vấn đề trong thực tế triển khai của dự án này. Không có thay đổi code
nào được thực hiện dựa trên review này, theo đúng nguyên tắc: chỉ một
lỗi đã chứng minh mới đủ lý do thay đổi hành vi, không phải một lỗi lý
thuyết.

**Cân nhắc ranh giới tương lai:** nếu điều này từng trở thành mối lo
(ví dụ cấu hình timezone của database thay đổi, hay một ranh giới API
tương lai cần nhận/trả ngày), cách sửa vững chắc hơn là ngừng phụ thuộc
hoàn toàn vào `Date` JS + việc ép kiểu phụ thuộc timezone ngầm định cho
cột `DATE`, và thay vào đó dùng chuỗi `YYYY-MM-DD` chuẩn tại ranh giới
tham số/trả về của Repository (parse/format tường minh, không bao giờ
qua các phương thức nhạy cảm với timezone local của `Date` như
`getDate()`/`getMonth()`). Điều này cần một task nhỏ riêng, không phải
một thay đổi gộp vào công việc không liên quan.

## Dịch lỗi

Các implementation Repository dùng lại hợp đồng `Result<T>` sẵn có của
dự án (`docs/ERROR_HANDLING.md`). Hai tình huống khác nhau luôn được
giữ tách biệt:

| Tình huống | Ví dụ | Result |
|---|---|---|
| Query chạy ổn, nhưng không có bản ghi domain nào khớp | Không có room với id đó | Một mã not-found cụ thể, ví dụ `ROOM_NOT_FOUND` |
| Bản thân query thất bại (kết nối, cú pháp, vi phạm ràng buộc chưa được kiểm tra trước) | Mất kết nối, vi phạm unique | Một mã chung, ví dụ `DATABASE_READ_FAILED` / `TRANSACTION_FAILED` |

Ngoại lệ duy nhất đã ghi rõ là `InvoiceRepository.findByRoomAndPeriod`:
"không có invoice cho room/kỳ này" là một kết quả **thành công** bình
thường, đã lường trước (`Result<Invoice | null>`) vì caller thường
đang hỏi "đã có cái nào chưa?" trước khi quyết định có tạo mới hay
không — xem chính comment đầu interface đó để biết lý do đầy đủ.

Lỗi PostgreSQL thô (văn bản SQL đang chạy, chi tiết kết nối, stack
trace) **không bao giờ** được đưa vào `message` của một `Result` — chỉ
được log phía server qua `logDatabaseError()`, để developer debug.

`PostgresInvoiceRepository.createInvoice` kiểm tra một mã lỗi
PostgreSQL cụ thể — unique-violation `SQLSTATE 23505` (ràng buộc
`UNIQUE(room_id, billing_period)`) — và dịch nó thành
`INVOICE_ALREADY_EXISTS`, vì `CreateInvoiceService`
(`backend/src/modules/invoice/create-invoice.service.ts`) thực sự cần
ánh xạ cụ thể này để chống lại một race condition mà bước pre-check
của chính nó không thể ngăn hoàn toàn (xem
`docs/CREATE_INVOICE_WORKFLOW.md` mục "Hoá đơn trùng lặp / race
condition"). Đây là ánh xạ SQLSTATE **duy nhất** trong codebase —
vẫn không có framework ánh xạ lỗi PostgreSQL tổng quát nào được xây
dựng. Mọi thất bại ghi khác (bao gồm một vi phạm ràng buộc khác) rơi
vào `DATABASE_WRITE_FAILED` chung.

## Quyền tối thiểu (least privilege)

Backend kết nối bằng một `DATABASE_URL` nên được giới hạn đúng phạm vi
truy cập mà ứng dụng này thực sự cần (đọc/ghi trên các bảng của chính
dự án này) — không phải một khoá service-role/admin của Supabase dùng
cho tiện lợi. Cấp phát đúng role cụ thể đó là một bước vận hành của
chủ repository trong Supabase dashboard, không phải thứ codebase này
có thể tự ép buộc, nhưng ranh giới connection string (chỉ backend,
không bao giờ gửi tới frontend) được đảm bảo theo thiết kế: không có
credential database nào từng được đọc bởi, hay truyền tới, code
frontend.

## SQL không phải bí mật; credential mới là bí mật

Văn bản SQL trong repository này (tên bảng, tên cột, hình dạng query)
không nhạy cảm — nó là mã nguồn hiển thị, như mọi logic khác, và được
kỳ vọng sẽ được đọc khi bảo vệ trực tiếp. Thứ **phải** giữ bí mật là
*credential* kết nối: `DATABASE_URL` (chứa mật khẩu), bất kỳ khoá
service-role nào của Supabase. Những thứ này không bao giờ xuất hiện
trong file đã commit — `backend/.env.example` chỉ chứa định dạng
placeholder (xem comment của chính nó), `.env` bị git-ignore, và không
có file test hay source nào nội suy một credential thật.

## Cố ý hoãn lại

Nền tảng persistence, luồng ghi hoá đơn (`CreateInvoiceService`, xem
`docs/CREATE_INVOICE_WORKFLOW.md`), và management API bắt buộc
(property/room/meter-reading/tariff — xem `docs/MANAGEMENT_API.md`)
nay đã được cài đặt đầy đủ. Vẫn cố ý **chưa** cài đặt: DELETE cho bất
kỳ tài nguyên nào (một quyết định về phạm vi, không phải một lỗ hổng —
xem `docs/MANAGEMENT_API.md` mục "Không có endpoint DELETE"), một bảng
ánh xạ mã lỗi PostgreSQL sang lỗi domain tổng quát (mỗi Repository chỉ
dịch đúng một case `SQLSTATE 23505` mà nó thực sự cần, qua kiểm tra cấu
trúc dùng chung `backend/src/database/unique-violation.ts`), và xác
thực/phân quyền/khu vực quản trị riêng. Giao diện trình duyệt (frontend)
đã được cài đặt đầy đủ — xem `docs/FRONTEND.md`; đây không còn là công
việc hoãn lại.
