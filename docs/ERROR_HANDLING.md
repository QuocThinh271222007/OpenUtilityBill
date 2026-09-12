# Xử lý lỗi

Tài liệu này mô tả cách OpenUtilityBill biểu diễn thành công và thất
bại, và vì sao. Tài liệu cố ý được giữ nhỏ gọn — xem
`docs/TECHNICAL_RATIONALE.md` để biết lý do tránh dùng một framework lỗi lớn
hơn.

## 1. Vấn đề với `return false`

Một hàm trả về `false` khi thất bại sẽ vứt bỏ *lý do* thất bại. Caller
không thể phân biệt "không tìm thấy room" với "không kết nối được
database" với "input không hợp lệ" nếu không tự bịa ra quy ước riêng.
Dự án này tránh mẫu đó cho mọi thất bại có ý nghĩa.

## 2. Hợp đồng `Result<T>`

Định nghĩa đúng một lần, tại `backend/src/shared/result.ts`:

```ts
export interface ResultError {
  code: string;
  message: string;
}

export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: ResultError };
```

Mọi hàm Service, business module, và Repository có thể thất bại có ý
nghĩa đều trả về `Result<T>` thay vì throw, trả `null`, hay trả
`false`. Điều này buộc caller phải kiểm tra `success` trước khi chạm
vào `data` — cơ chế thu hẹp discriminated union của TypeScript khiến
trường hợp không kiểm tra trở thành lỗi compile ở chế độ strict.

Hai helper nhỏ giữ cho nơi gọi dễ đọc:

```ts
ok(data)                    // → { success: true, data }
fail(code, message)         // → { success: false, error: { code, message } }
```

## 3. Hợp đồng thành công (HTTP)

```json
{
  "success": true,
  "data": { }
}
```

## 4. Hợp đồng thất bại (HTTP)

```json
{
  "success": false,
  "error": {
    "code": "ROOM_NOT_FOUND",
    "message": "Room could not be found."
  }
}
```

## 5. Cách đặt tên mã lỗi

Mã lỗi dùng `UPPER_SNAKE_CASE`, riêng theo domain, và mô tả *cái gì*
thất bại, không phải *thất bại như thế nào* (không nhúng HTTP status
hay stack trace vào mã lỗi). REST API (`docs/API.md`,
`docs/MANAGEMENT_API.md`) nay đã nối toàn bộ các mã này với logic thật
— mỗi endpoint ánh xạ lỗi `Result` của nó thành một HTTP status qua một
bảng dùng chung (`backend/src/shared/http/result-error-status.ts`,
`mapResultErrorCodeToHttpStatus` — xem `docs/API.md` mục "HTTP status
mapping" để có bảng đầy đủ, bao gồm cả các mã `INVALID_*`/cấu trúc tier
riêng của Calculation Core không lặp lại ở đây):

- `VALIDATION_ERROR` — validate hình dạng input ở tầng Service (ví dụ
  `roomId`, `billingPeriod`, phương pháp tính, kiểm tra scale thập
  phân).
- `ROOM_NOT_FOUND` / `ROOM_ALREADY_EXISTS`
- `PROPERTY_NOT_FOUND`
- `METER_READING_NOT_FOUND` / `METER_READING_ALREADY_EXISTS` /
  `METER_READING_IN_USE`
- `INVALID_METER_READING`
- `TARIFF_NOT_FOUND` / `TARIFF_ALREADY_EXISTS` / `TARIFF_PERIOD_OVERLAP`
  / `TARIFF_IN_USE`
- `AMBIGUOUS_TARIFF_CONFIGURATION` / `TARIFF_CONFIGURATION_INVALID`
- `INVOICE_ALREADY_EXISTS`
- `INVOICE_NOT_FOUND` — `GetInvoiceService`, không có invoice nào đã
  lưu cho (roomId, billingPeriod) đã cho.
- `TRANSACTION_FAILED`
- `DATABASE_READ_FAILED` / `DATABASE_WRITE_FAILED`
- `INTERNAL_ERROR` — một exception bất ngờ (không phải `Result`) bị bắt
  tại ranh giới Controller; không bao giờ trả stack trace thô trong
  response.

## 6. Pipeline fail-fast

Một Service điều phối nhiều bước sẽ dừng lại ở thất bại đầu tiên và trả
về ngay lập tức — nó không bao giờ để một bước sau chạy trên một bước
trước đã thất bại:

```
Module A → PASS
Module B → PASS
Module C → FAIL
DỪNG. Trả về lỗi của Module C. Không chạy Module D.
```

Cụ thể trong TypeScript, điều này trông giống như return sớm ở mỗi
`Result` trung gian:

```ts
const roomResult = await loadRoom(roomId);
if (!roomResult.success) {
  return roomResult; // dừng pipeline, lan truyền đúng lỗi đó
}

const tariffResult = await loadTariff(roomResult.data.tariffId);
if (!tariffResult.success) {
  return tariffResult;
}

// chỉ tiếp tục khi MỌI bước bắt buộc đã thành công
```

Đây là lý do Controller của health
(`backend/src/modules/health/health.controller.ts`) kiểm tra
`result.success` trước khi đọc `result.data`, dù Service health hiện
tại chưa thể thất bại — mẫu này được thiết lập sẵn ở đây để mọi module
sau này theo đúng cùng hình dạng.

## 7. Lỗi mong đợi và lỗi không mong đợi

- **Lỗi mong đợi / lỗi domain** (ví dụ không tìm thấy room, cấu hình
  biểu giá không hợp lệ): biểu diễn dưới dạng `Result` thất bại với một
  mã lỗi cụ thể. Đây là kết quả bình thường của một workflow, không
  phải bug.
- **Lỗi không mong đợi / lỗi nội bộ** (ví dụ một exception bị throw từ
  thư viện, một lỗi lập trình): không được mô hình hoá thành `Result`
  thất bại theo domain. Chúng nên được bắt tại ranh giới Controller và
  chuyển thành một response `500` chung với một mã lỗi chung (ví dụ
  `INTERNAL_ERROR`), không bao giờ re-throw vào HTTP response dưới dạng
  stack trace.

## 8. Message hiển thị cho người dùng và thông tin chẩn đoán cho developer

- Field `message` trong một response lỗi phải hiểu được với người dùng
  cuối (hoặc ít nhất không gây hoang mang/quá kỹ thuật).
- Field `code` là thứ developer và support dùng để xác định chính xác
  bước kiểm tra nào đã thất bại, mà không cần đọc nội dung message.
- Stack trace và chi tiết exception nội bộ không bao giờ được gửi cho
  client. Chúng chỉ thuộc về log phía server.

## 9. Những gì dự án này cố ý không làm

- Không có hệ thống class `Error` con tuỳ biến (ví dụ
  `RoomNotFoundError extends DomainError extends AppError`). Một object
  `{ code, message }` thuần là đủ để xác định và truyền đạt một thất
  bại, và dễ đọc, dễ bảo trì hơn nhiều so với một cây class.
- Không có framework xử lý exception toàn cục hay decorator nào.
  Controller dùng một kiểm tra early-return thuần trên
  `result.success`.
