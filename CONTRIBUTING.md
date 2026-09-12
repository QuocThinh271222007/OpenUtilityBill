# Đóng góp cho OpenUtilityBill

Cảm ơn bạn đã quan tâm đến việc đóng góp cho OpenUtilityBill. Dự án ưu tiên mã nguồn rõ ràng, có thể kiểm thử, dễ mở rộng và bảo toàn độ chính xác của các phép tính điện/nước.

## Bắt đầu phát triển

Clone repository và cài đặt dependency:

```bash
git clone https://github.com/QuocThinh271222007/OpenUtilityBill.git
cd OpenUtilityBill

cd backend
npm ci
npm run typecheck
npm run build
npm test

cd ../frontend
npm ci
npm run typecheck
npm run build
```

Xem hướng dẫn môi trường và cách chạy chi tiết tại [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

Các integration test cần PostgreSQL thật sẽ tự bỏ qua khi `DATABASE_URL` chưa được cấu hình. Không đưa connection string thật vào mã nguồn, tài liệu, Issue hoặc Pull Request.

## Quy trình đóng góp

1. Kiểm tra Issues hiện có để tránh trùng lặp.
2. Mở Issue trước nếu thay đổi có phạm vi lớn, làm thay đổi hành vi nghiệp vụ, API hoặc schema.
3. Tạo branch mới từ `main`.
4. Thực hiện thay đổi có phạm vi rõ ràng, kèm test hoặc bằng chứng kiểm chứng phù hợp.
5. Chạy typecheck, build và test liên quan trước khi push.
6. Push branch và mở Pull Request.
7. Đảm bảo GitHub Actions CI đạt trước khi merge.

## Quy ước branch

Tên branch nên thể hiện loại thay đổi và phạm vi, ví dụ:

```text
feat/<ten-tinh-nang>
fix/<ten-loi>
docs/<noi-dung>
refactor/<pham-vi>
test/<pham-vi>
chore/<pham-vi>
```

## Quy ước commit

Dự án ưu tiên Conventional Commits. Ví dụ:

```text
feat(ui): improve invoice input formatting
fix(api): reject invalid billing period
docs(readme): improve architecture documentation
test(calculation): add rollover boundary cases
```

Một commit nên đại diện cho một thay đổi logic rõ ràng. Không squash toàn bộ lịch sử phát triển chỉ để làm repository ngắn hơn.

## Kiểm tra trước Pull Request

Backend:

```bash
cd backend
npm run typecheck
npm run build
npm test
```

Frontend:

```bash
cd frontend
npm run typecheck
npm run build
```

GitHub Actions chạy các bước kiểm tra tương ứng trên mỗi `push` và `pull_request`. CI không yêu cầu kết nối tới Supabase/PostgreSQL thật; các integration test phụ thuộc `DATABASE_URL` vẫn được test runner phát hiện nhưng tự đánh dấu `SKIP` khi biến môi trường không tồn tại.

## Nguyên tắc kiến trúc

Các đóng góp cần giữ ranh giới hiện tại:

```text
Frontend
    ↓
REST Controller
    ↓
Service / Orchestrator
    ├── Calculation Core
    ↓
Repository
    ↓
Postgres.js
    ↓
PostgreSQL
```

Các nguyên tắc chính:

- Controller không chứa business logic hoặc SQL.
- Service không phụ thuộc trực tiếp vào Postgres.js.
- Repository chịu trách nhiệm truy cập dữ liệu và ánh xạ persistence.
- Calculation Core không phụ thuộc HTTP, Express, Supabase hoặc database.
- Frontend không được gửi, nhận hoặc điều khiển SQL như cơ chế thực thi.
- Biểu giá và quy tắc cấu hình không được hard-code vào Calculation Core.
- Ưu tiên các module nhỏ, trách nhiệm rõ ràng và luồng lỗi fail-fast.

Xem thêm [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/CALCULATION_CORE.md`](docs/CALCULATION_CORE.md) và [`docs/TECHNICAL_RATIONALE.md`](docs/TECHNICAL_RATIONALE.md).

## Độ chính xác tài chính

Không dùng `Number`, `parseFloat`, `Math.round` hoặc phép toán floating-point cho giá trị tài chính/đo lường tại các ranh giới đã được thiết kế dùng decimal string/exact arithmetic.

Các nguyên tắc cần giữ:

- PostgreSQL `NUMERIC` đi qua persistence boundary dưới dạng chuỗi thập phân chính xác.
- Calculation Core dùng số học chính xác dựa trên `BigInt`/rational theo thiết kế hiện tại.
- Frontend chỉ định dạng chuỗi tiền để hiển thị, không tính lại số tiền backend đã tính.
- Làm tròn tiền chỉ thực hiện tại đúng boundary nghiệp vụ đã định nghĩa.

Xem [`docs/NUMERIC_PRECISION.md`](docs/NUMERIC_PRECISION.md) để biết chi tiết.

## Database và migration

- Không sửa migration đã phát hành theo cách làm thay đổi lịch sử schema nếu có thể dùng migration mới.
- Mọi thay đổi schema mới phải được mô tả rõ về tương thích và cách migration.
- Không chạy thao tác reset/xoá dữ liệu trên database dùng chung chỉ để phục vụ test.
- Giữ query tham số hoá; không ghép dữ liệu người dùng trực tiếp vào SQL.
- Thay đổi nhiều bước cần tính nguyên tử phải giữ ranh giới transaction phù hợp.

## Bảo mật và secret

Không commit hoặc đăng công khai:

- `.env` thật;
- `DATABASE_URL`;
- mật khẩu database;
- API key;
- access token hoặc secret tương tự.

Nếu một secret bị lộ, cần rotate secret đó thay vì chỉ xoá khỏi commit mới.

## Calculation Core

Các thay đổi dưới `backend/src/calculation/` cần được xem xét đặc biệt cẩn thận. Mỗi thay đổi công thức hoặc quy tắc phải:

- có test tương ứng;
- giữ độ chính xác hiện tại;
- không phụ thuộc database hoặc frontend;
- không thay đổi hành vi ngoài phạm vi Pull Request đã mô tả;
- giữ cấu hình biểu giá/rule ở dạng dữ liệu đầu vào thay vì hard-code.

## Frontend

Frontend hiện sử dụng HTML5, TypeScript, Vite, Bootstrap và DOM API. Khi đóng góp UI/UX:

- ưu tiên khả năng sử dụng trên desktop và mobile;
- giữ khả năng thao tác bằng bàn phím và label phù hợp;
- hiển thị trạng thái loading/empty/error rõ ràng;
- không tái cài đặt business validation thuộc backend/Calculation Core;
- không tự tính lại các tổng tiền đã được backend trả về;
- không thêm framework hoặc dependency lớn khi chưa có lý do kỹ thuật rõ ràng.

Thay đổi giao diện nên kèm ảnh chụp hoặc mô tả cách kiểm tra thủ công trong Pull Request khi phù hợp.

## Pull Request

Pull Request nên mô tả ngắn gọn:

- vấn đề cần giải quyết;
- thay đổi đã thực hiện;
- cách kiểm thử;
- ảnh hưởng đến API/database nếu có;
- ảnh chụp giao diện nếu thay đổi UI/UX.

Không trộn nhiều thay đổi không liên quan vào cùng một Pull Request.

## Báo lỗi và đề xuất

Sử dụng [GitHub Issues](https://github.com/QuocThinh271222007/OpenUtilityBill/issues) để báo lỗi hoặc đề xuất cải tiến.

Khi báo lỗi, nên cung cấp bước tái hiện, kết quả mong đợi, kết quả thực tế, môi trường chạy và log/ảnh chụp liên quan nếu có.

## Giấy phép

Khi đóng góp mã nguồn cho repository này, phần đóng góp được phát hành theo giấy phép MIT của dự án. Giữ `SPDX-License-Identifier: MIT` trong các file nguồn khi cấu trúc file hiện tại sử dụng SPDX header.
