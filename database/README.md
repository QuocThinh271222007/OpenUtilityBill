# Database

Thư mục này chứa schema PostgreSQL và seed cấu hình cho
OpenUtilityBill, host trên [Supabase](https://supabase.com).

## Trạng thái hiện tại

Schema domain ban đầu, seed cấu hình mặc định của kỳ thi, và một bộ
script kiểm chứng runtime tồn tại dưới dạng file SQL (bên dưới). Cả hai
migration, seed, và toàn bộ backend REST API/frontend đã được chạy
thật đối với một database PostgreSQL thật (Supabase) trong lần chạy
runtime closure gần nhất — 320/320 test PASS, 0 SKIP, bao gồm cả
transaction commit/rollback thật, đọc/ghi Repository thật, và
`POST`/`GET /api/v1/invoices` qua HTTP thật. Health endpoint
(`GET /api/v1/health`) vẫn cố ý không chạm database — xem
`docs/ARCHITECTURE.md`.

Chạy các script kiểm chứng (thủ công, trong Supabase SQL Editor) là
cách biến "schema trông có vẻ đúng" thành "PostgreSQL đã xác nhận
schema đúng" — xem bên dưới.

## Cấu trúc

```
database/
  migrations/
    001_initial_domain_schema.sql          Bảng, ràng buộc, quan hệ
    002_preserve_invoice_item_precision.sql  Nới invoice_items.quantity/amount thành NUMERIC không giới hạn
  seeds/
    001_competition_defaults.sql           Biểu giá mặc định chính thức của kỳ thi
  validation/
    001_domain_success_validation.sql      Chạy một lần: kiểm tra schema/seed + chứng minh dữ liệu hợp lệ
    002_domain_constraint_validation.sql   Chạy từng khối một: chứng minh ràng buộc từ chối dữ liệu sai
    003_validation_cleanup.sql             Lưới an toàn: chỉ xoá các dòng VALIDATION_*
    004_invoice_item_precision_validation.sql  Chạy một lần: chứng minh quantity/amount giữ được >2 chữ số thập phân
```

## Chạy các file này (khi có một database Supabase thật)

```bash
psql "$DATABASE_URL" -f database/migrations/001_initial_domain_schema.sql
psql "$DATABASE_URL" -f database/migrations/002_preserve_invoice_item_precision.sql
psql "$DATABASE_URL" -f database/seeds/001_competition_defaults.sql
```

Seed an toàn để chạy lại — xem ghi chú idempotency ở đầu
`database/seeds/001_competition_defaults.sql`.

## Kiểm chứng runtime với Supabase SQL Editor

Review SQL tĩnh (`BEGIN`/`COMMIT` cân bằng, thứ tự tạo bảng đúng, v.v.)
không giống với bằng chứng rằng PostgreSQL thực sự chấp nhận schema
này và ép buộc các ràng buộc của nó. Các file `database/validation/`
cung cấp bằng chứng đó bằng cách insert cả dòng hợp lệ lẫn dòng cố ý
không hợp lệ vào một database thật, rồi rollback toàn bộ.

Việc kiểm chứng được tách thành hai file với hai mô hình thực thi khác
nhau, vì chúng cần cách xử lý khác nhau trong SQL Editor:

- **`001_domain_success_validation.sql`** chứa **zero** câu lệnh cố ý
  thất bại — an toàn để paste và chạy **toàn bộ, trong một lần thực
  thi**.
- **`002_domain_constraint_validation.sql`** chứa 18 khối đánh số
  (`D1`–`D18`), mỗi khối **cố ý** kích hoạt một lỗi ràng buộc
  PostgreSQL để chứng minh ràng buộc đó thực sự từ chối dữ liệu sai.
  **Chạy đúng một khối đánh số cho mỗi lần bấm "Run" — không bao giờ
  chạy cả file cùng lúc.** Một client PostgreSQL (kể cả, có thể, Supabase
  SQL Editor) có thể dừng thực thi một batch đã paste ngay khi một câu
  lệnh trong đó báo lỗi — nên câu lệnh dọn dẹp của một khối sau có thể
  không bao giờ chạy nếu tất cả được gửi cùng nhau. Mỗi khối tự đủ (có
  `BEGIN`/setup/`ROLLBACK` riêng) chính vì lý do đó để không phải là
  vấn đề: chạy một khối, đọc kết quả, chuyển sang khối tiếp theo.

Không cần và không mong đợi một PostgreSQL/Docker local nào. Các bước,
dùng chính SQL Editor của dự án Supabase:

1. Tạo (hoặc mở) dự án Supabase cho repository này.
2. Mở **SQL Editor** trong Supabase dashboard.
3. Paste và chạy `database/migrations/001_initial_domain_schema.sql`.
   Kỳ vọng: **PASS** (thành công, không lỗi).
4. Paste và chạy `database/migrations/002_preserve_invoice_item_precision.sql`.
   Kỳ vọng: **PASS**.
5. Paste và chạy `database/seeds/001_competition_defaults.sql`.
   Kỳ vọng: **PASS**.
6. Paste và chạy `database/validation/001_domain_success_validation.sql`
   **toàn bộ, trong một lần thực thi**. Kỳ vọng: **PASS** ở mọi câu
   lệnh — đọc từng comment `-- Kỳ vọng:` và so sánh với kết quả thực
   tế. Bất kỳ lỗi nào ở đây nghĩa là một vấn đề thật, không phải một
   lỗi đã lường trước.
7. Mở `database/validation/002_domain_constraint_validation.sql` và
   chạy các khối `D1` tới `D18` **từng khối một**, theo thứ tự hoặc
   thứ tự bất kỳ — chúng không phụ thuộc lẫn nhau. Với mỗi khối: chọn
   đúng SQL của khối đó (từ header `-- ====` xuống tới `ROLLBACK;`
   cuối cùng của nó), chạy nó, và so sánh lỗi PostgreSQL thực sự trả
   về với comment `-- Kỳ vọng: FAIL — ...` của khối đó. **Một lỗi ràng
   buộc ở đây là test PASS, không phải FAIL.** Điền vào checklist
   PASS/FAIL gần đầu file đó khi bạn đi qua từng khối.
8. Paste và chạy `database/validation/004_invoice_item_precision_validation.sql`
   **toàn bộ, trong một lần thực thi** (không có lỗi cố ý, cùng mô
   hình như bước 6). Kỳ vọng: `quantity_text` = `'62.5125'` và
   `amount_text` = `'124025.123456'` **chính xác**, chứng minh
   migration 002 thực sự ngăn làm tròn âm thầm trên PostgreSQL thật,
   không chỉ trên giấy.
9. Tuỳ chọn chạy `database/validation/003_validation_cleanup.sql` như
   một lưới an toàn — nó chỉ xoá các dòng có tên bắt đầu bằng
   `VALIDATION_SUCCESS_`, `VALIDATION_CONSTRAINT_`, hoặc
   `VALIDATION_PRECISION_`, và không bao giờ chạm vào các dòng
   `Competition Default ...`. Trong điều kiện bình thường (bước 6–8
   chạy đúng như ghi rõ) nó sẽ không tìm thấy gì để xoá, vì không file
   kiểm chứng nào từng gọi `COMMIT`.
10. Để chứng minh seed idempotent: chạy
    `database/seeds/001_competition_defaults.sql` lần thứ hai (kỳ
    vọng: **PASS**, không lỗi), rồi chạy lại các query "B. Kiểm chứng
    seed kỳ thi" trong `001_domain_success_validation.sql` — mọi số
    đếm phải không đổi (1 tariff điện, 6 tier, 1 tariff nước), chứng
    minh lần chạy thứ hai không tạo ra bản trùng lặp nào.
11. **Không bao giờ** paste một connection string thật, mật khẩu
    database, hay khoá service-role/anon của Supabase vào bất kỳ file
    nào trong repository này — chỉ chạy các file này trực tiếp bên
    trong Supabase SQL Editor, nơi credential được chính Supabase xử
    lý, không gõ vào một file.

### Vì sao không dùng một file lớn với `SAVEPOINT`

Một phiên bản kiểm chứng trước đây dùng một file duy nhất với
`SAVEPOINT` / `ROLLBACK TO SAVEPOINT` quanh mỗi lỗi cố ý, dự định paste
và chạy một lần. Bản thân `SAVEPOINT` là một tính năng PostgreSQL thật
và đúng đắn — nó tạo một điểm khôi phục được bên trong một transaction,
để một `ROLLBACK TO SAVEPOINT` sau đó có thể hoàn tác chỉ phần việc kể
từ điểm đó. Vấn đề chưa bao giờ nằm ở ngữ nghĩa của `SAVEPOINT`: nó
nằm ở chỗ `SAVEPOINT` chỉ hữu ích nếu SQL client tiếp tục gửi câu lệnh
*tiếp theo* (`ROLLBACK TO SAVEPOINT`) sau một lỗi — và một số SQL
client dừng thực thi phần còn lại của một batch đã paste ngay khi một
câu lệnh trong đó thất bại. Trông cậy vào hành vi tiếp tục đó khiến
bằng chứng trở nên mong manh theo cách phụ thuộc vào hành vi cụ thể
của Supabase SQL Editor thay vì vào các đảm bảo thật sự của PostgreSQL.
Tách thành các khối độc lập, một mục đích duy nhất
(`002_domain_constraint_validation.sql`) loại bỏ hoàn toàn phụ thuộc
đó: mỗi khối kết thúc (thành công hay không) trước khi khối tiếp theo
thậm chí được gửi đi.

## Tài liệu thiết kế

- [`docs/DOMAIN_MODEL.md`](../docs/DOMAIN_MODEL.md) — mỗi thực thể
  nghĩa là gì, bất biến của nó, và vì sao nó tồn tại riêng biệt.
- [`docs/DATABASE_DESIGN.md`](../docs/DATABASE_DESIGN.md) — lý do ở
  mức schema: chuẩn hoá, chiến lược định danh, khoá ngoại, ràng buộc,
  `NUMERIC` so với `FLOAT`, vì sao chưa dùng ORM/trigger/stored
  procedure.
- [`docs/TRANSACTIONS.md`](../docs/TRANSACTIONS.md) — đảm bảo ACID và
  ranh giới transaction cho các workflow ghi (`CreateInvoice`, cấu
  hình tariff).

## Cách tiếp cận

- Cách truy cập: SQL trực tiếp, không ORM (xem `docs/LEARNING_NOTES.md`).
- Cô lập persistence: mọi SQL sống đằng sau các module Repository
  trong `backend/src/repositories/`, không bao giờ bên trong Controller
  hay Service (xem `docs/ARCHITECTURE.md`).
- Cấu hình kết nối: `DATABASE_URL` (xem `backend/.env.example`). Không
  bao giờ commit credential thật vào repository này.

Database client, các implementation Repository, và workflow
`CreateInvoice` được mô tả trong `docs/TRANSACTIONS.md` nay đều đã
được cài đặt đầy đủ — xem `docs/DATABASE_ACCESS.md` và
`docs/CREATE_INVOICE_WORKFLOW.md`.
