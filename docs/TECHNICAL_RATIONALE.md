# Cơ sở lựa chọn kỹ thuật

Tài liệu này ghi lại cơ sở kỹ thuật của các lựa chọn công nghệ và kiến
trúc trong OpenUtilityBill. Các quyết định được đánh giá theo phạm vi,
yêu cầu nghiệp vụ, khả năng kiểm thử, độ rõ ràng và chi phí vận hành
của hệ thống — không phải chân lý phổ quát áp dụng cho mọi dự án.

## Vì sao TypeScript

TypeScript thêm kiểu tĩnh (static typing) lên trên JavaScript. Với một
hệ thống tính toán hoá đơn — nơi một lỗi nhỏ (nhầm `string` thành
`number`, quên một field trong response) có thể dẫn đến số tiền sai —
việc trình biên dịch bắt lỗi *trước khi chạy* có giá trị lớn hơn nhiều
so với chi phí phải viết type. `Result<T>` (xem `docs/ERROR_HANDLING.md`)
cũng chỉ thực sự an toàn khi có TypeScript: nhờ discriminated union,
việc quên kiểm tra `success` trước khi đọc `data` sẽ bị báo lỗi
compile-time.

## Vì sao Node.js

Frontend đã dùng TypeScript/JavaScript; dùng Node.js cho backend cho
phép dùng chung một ngôn ngữ (TypeScript) ở cả hai phía, giảm chi phí
chuyển ngữ cảnh giữa hai tầng. Hệ sinh thái npm cũng có sẵn Express,
driver PostgreSQL, và công cụ build (Vite, tsc) cần cho dự án này.

## Vì sao Express

Express là framework HTTP tối giản, không áp đặt kiến trúc. Điều đó
phù hợp với chủ trương của dự án là **tự thiết kế** ranh giới Route →
Controller → Service → Repository, thay vì bị framework ép theo một
cấu trúc có sẵn (như NestJS với decorator và dependency injection tự
động). Express giữ luồng HTTP tường minh (`app.use`, `router.get`,
middleware), giúp việc theo dõi request, debug và kiểm thử các tầng
Route → Controller → Service rõ ràng hơn.

## Vì sao Vite

Vite cho dev server khởi động nhanh (native ES modules, không bundle
toàn bộ khi dev) và build production đơn giản. Không cần cấu hình phức
tạp như Webpack để có một ứng dụng TypeScript + HTML tĩnh chạy được.

## Vì sao Bootstrap

Bootstrap cho một bộ UI component (badge, container, spacing utility)
sẵn có, để không phải tự viết CSS từ đầu cho những thứ cơ bản (layout,
màu sắc trạng thái). Dự án chỉ dùng Bootstrap qua package npm (import
CSS), không tuỳ biến sâu — khi cần, `frontend/styles/main.css` là nơi
thêm CSS tuỳ chỉnh nhỏ.

## Vì sao PostgreSQL

PostgreSQL là RDBMS mã nguồn mở, hỗ trợ tốt các ràng buộc dữ liệu
(foreign key, check constraint, transaction) — quan trọng cho bài toán
hoá đơn nơi tính đúng đắn của dữ liệu (số điện/nước không âm, không
trùng kỳ hoá đơn, ...) cần được đảm bảo ở tầng database, không chỉ ở
tầng ứng dụng.

## Vì sao Supabase

Supabase cung cấp PostgreSQL được quản lý sẵn và phù hợp với phạm vi
triển khai hiện tại, không yêu cầu tự quản lý server database. Dự án
chỉ dùng Supabase như nơi host PostgreSQL — không dùng các tính năng
khác của Supabase (auth, realtime, storage) ở giai đoạn này.

## Vì sao REST

REST + JSON là chuẩn phổ biến, dễ hiểu, dễ test bằng `curl`/Postman mà
không cần công cụ đặc biệt. Với một API có domain rõ ràng (property,
room, invoice, ...) REST ánh xạ tự nhiên vào resource
(`/api/v1/rooms/:id`).

### Vì sao không GraphQL

GraphQL giải quyết vấn đề over-fetching/under-fetching khi có nhiều
loại client với nhu cầu dữ liệu khác nhau. Dự án này chỉ có một
frontend nội bộ biết chính xác nó cần gì, nên lợi ích của GraphQL
không đủ để bù chi phí thêm một tầng schema/resolver mới.

## Vì sao dùng SQL trực tiếp, chưa dùng ORM

Viết SQL trực tiếp (thay vì Prisma/Sequelize/Drizzle) giúp:

- SQL trực tiếp giúp câu query được hiển thị tường minh và dễ đối
  chiếu với schema, migration và kế hoạch thực thi — quan trọng khi
  logic tính hoá đơn phụ thuộc vào JOIN và điều kiện cụ thể.
- Tránh một tầng trừu tượng nữa cần học và debug khi query không đúng
  như mong đợi (truy vết SQL do ORM sinh ra thường tốn thêm một bước
  gián tiếp).
- Repository module (xem `docs/ARCHITECTURE.md`) đã đủ để cô lập SQL
  khỏi business logic — đây là lý do chính ORM giải quyết, nên ORM
  không còn cần thiết ở quy mô dự án này.

Nếu sau này dự án lớn lên và việc viết SQL tay trở nên lặp lại quá
nhiều, đây sẽ là quyết định được xem xét lại — nhưng không phải bây
giờ.

### Vì sao Postgres.js (thay vì `pg`, hay một ORM)

Dự án dùng package `postgres` ("Postgres.js") làm CLIENT PostgreSQL —
không phải ORM, chỉ mở kết nối và gửi đúng câu SQL đã viết. Hai lý do
cụ thể:

1. Cú pháp tagged template (`` sql`SELECT ... WHERE id = ${id}` ``)
   tham số hoá giá trị AN TOÀN mà vẫn đọc như một câu SQL bình thường,
   không cần gọi `.query(text, [params])` với chỉ số vị trí ($1, $2,
   ...) như client `pg` truyền thống — dễ đọc, dễ đối chiếu với SQL
   trong migration.
2. Đã KIỂM CHỨNG (không suy đoán) rằng Postgres.js trả về cả `NUMERIC`
   lẫn `BIGINT` dưới dạng `string` theo MẶC ĐỊNH — đúng với ranh giới
   chính xác tuyệt đối mà dự án đã chọn cho tiền/kWh/ID (xem
   `docs/DATABASE_ACCESS.md` mục "Ranh giới độ chính xác `NUMERIC` /
   `BIGINT`").

Chi tiết đầy đủ về Repository boundary, transaction, và ranh giới
chính xác số học ở tầng database: xem `docs/DATABASE_ACCESS.md`.

## Vì sao Modular Monolith, không phải Microservices

Xem chi tiết trong `docs/ARCHITECTURE.md` mục 1. Tóm tắt: microservices
giải quyết vấn đề về việc *scale từng phần độc lập* và *nhiều nhóm làm
việc song song*. Với phạm vi domain hiện tại và nhu cầu triển khai như
một đơn vị, microservices tạo thêm chi phí vận hành và giao tiếp mạng
không cần thiết — network call, service discovery, nhiều repo/
deployment, độ trễ debug — lớn hơn nhiều lợi ích nó mang lại ở quy mô
này.

## Vì sao nhiều module nhỏ

Một hàm làm quá nhiều việc (ví dụ `createInvoice()` vừa validate, vừa
query, vừa tính toán, vừa trả HTTP) rất khó test và khó review từng
phần. Chia thành nhiều hàm nhỏ, mỗi hàm một trách nhiệm rõ ràng
(`LoadRoom`, `CalculateElectricityTax`, ...) giúp:

- Test từng bước độc lập.
- Đọc code theo từng bước tuần tự, dễ theo dõi khi debug.
- Kiểm thử và review từng hàm riêng lẻ, thay vì phải xử lý một khối
  logic lớn cùng lúc.

Nhiều module không đồng nghĩa với phức tạp hơn — ngược lại, nó làm
từng phần *đơn giản hơn* để hiểu riêng lẻ.

## Vì sao fail-fast

Nếu một bước bắt buộc thất bại (ví dụ không tìm thấy Room) mà pipeline
vẫn tiếp tục chạy các bước sau, các bước đó sẽ thao tác trên dữ liệu
không hợp lệ (`undefined`, giá trị mặc định sai) và tạo ra lỗi dây
chuyền khó truy vết — lỗi thực sự (Room not found) bị che bởi lỗi phái
sinh ở bước sau. Dừng ngay tại bước thất bại và trả về đúng lỗi đó
giúp lỗi luôn được chẩn đoán tại nguồn.

## Vì sao dùng error có cấu trúc (Result contract)

Xem `docs/ERROR_HANDLING.md`. Lý do cốt lõi: `return false` không mang
theo lý do thất bại, khiến caller phải tự đoán, và gây khó khăn khi
đọc lại code về sau.

## Vì sao Calculation Core được cô lập

Phần tính điện/nước là thành phần nghiệp vụ cốt lõi của hệ thống — có
yêu cầu cao nhất về tính đúng đắn số học, và có khả năng cần điều
chỉnh nhiều lần theo yêu cầu nghiệp vụ. Nếu phần này phụ thuộc vào
Express hay Supabase, mỗi lần muốn test một công thức tính, phải khởi
động cả server và database. Giữ nó là TypeScript thuần giúp viết unit
test nhanh, chạy trong mili-giây, không cần mock nhiều thứ.

## Vì sao chưa dùng đệ quy (recursion) cho việc tính bậc thang tariff

TypeScript hỗ trợ đệ quy bình thường, và đệ quy **không** tự nó là xấu
— với cấu trúc dữ liệu dạng cây/đồ thị (ví dụ duyệt cây thư mục,
parser), đệ quy thường là cách biểu diễn tự nhiên nhất.

Nhưng các bậc (tier) của biểu giá điện/nước dự kiến là một **danh sách
tuyến tính, hữu hạn** (bậc 1, bậc 2, bậc 3, ...), không phải cấu trúc
cây hay đồ thị. Với dữ liệu tuyến tính, một vòng lặp (`for`) đơn giản:

- Dễ đọc hơn với người không quen đệ quy.
- Không tạo thêm call stack cho mỗi bậc (dù với vài bậc thì không đáng
  kể, thói quen dùng vòng lặp cho dữ liệu tuyến tính vẫn nên được giữ
  nhất quán).
- Dễ debug từng bước bằng cách đặt breakpoint/log trong một vòng lặp
  hơn là theo dõi nhiều lần gọi hàm lồng nhau.

Tóm lại: đệ quy so với vòng lặp không phải "cái nào tốt hơn tuyệt
đối" — nó phụ thuộc hình dạng dữ liệu. Bài toán bậc thang tariff của
dự án này có hình dạng tuyến tính, nên vòng lặp là lựa chọn phù hợp và
dễ giải thích hơn.

## Vì sao ưu tiên code dễ đọc hơn code "khéo léo"

Một dòng code cô đọng (dùng `reduce`/`map` lồng nhau, toán tử ba ngôi
lồng nhau, ...) có thể ngắn hơn, nhưng nếu không thể đọc lại và hiểu
nó sau một khoảng thời gian, nó đã thất bại ở mục tiêu quan trọng nhất
của dự án này: khả năng giải thích được (**explainability**). Một
vòng lặp rõ ràng, một hàm được đặt tên tốt, dễ bước qua (step through)
bằng debugger, có giá trị hơn việc tiết kiệm vài dòng code.

## Khi nào một abstraction trở thành overengineering

Một abstraction (interface, base class, wrapper, config layer, ...) là
overengineering trong dự án này khi nó tồn tại để giải quyết một nhu
cầu **chưa xảy ra**, thay vì một nhu cầu đã có ngay hiện tại. Ví dụ cụ
thể trong dự án:

- Chưa tạo class `BaseController`/`BaseRepository` cho tới khi có ít
  nhất hai module thực sự cần chia sẻ hành vi giống nhau, và hành vi
  đó không thể diễn đạt đơn giản hơn bằng một hàm dùng chung.
- Chưa thêm dependency injection framework — hiện tại các module chỉ
  cần `import` trực tiếp nhau theo đúng chiều phụ thuộc (xem
  `docs/ARCHITECTURE.md` mục 4); DI framework chỉ có giá trị khi việc
  wire thủ công trở nên thực sự cồng kềnh.
- Chưa tạo `.env` config loader riêng — `process.env.PORT` đọc trực
  tiếp trong `server.ts` là đủ rõ ràng cho một biến môi trường duy
  nhất.

Quy tắc thực dụng: nếu không thể chỉ ra được đoạn code cụ thể sẽ khó
hiểu hơn/khó mở rộng hơn *ngay bây giờ* nếu thiếu abstraction đó, thì
chưa nên thêm nó.
