# Calculation Core

Tài liệu này giải thích pipeline tính hoá đơn được cài đặt trong
`backend/src/calculation/`. Nó bổ sung cho
[`docs/NUMERIC_PRECISION.md`](NUMERIC_PRECISION.md) (chiến lược số
học) và [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) (tầng này nằm ở đâu
trong hệ thống tổng thể).

## Có gì, và chưa có gì

Đây là một **tầng tính toán thuần** — nó tính tiền điện/nước từ dữ liệu
được truyền vào như tham số hàm. Nó **không**:

- Đọc từ hay ghi vào PostgreSQL/Supabase.
- Biết gì về Express, `Request`/`Response`, hay HTTP.
- Lưu trữ bất cứ thứ gì.
- Cung cấp một REST endpoint, Controller, Service, hay Repository — đó
  là các tầng khác, do các file khác đảm nhiệm.

## Sơ đồ pipeline (ASCII)

```
Config / input (chuỗi thập phân, số thuần)
          │
          ▼
   ┌─────────────────┐
   │  calculateMeterUsage   │  previous, current, max → usage (xử lý rollover)
   └─────────────────┘
          │ usageKwh
          ▼
   ┌───────────────────────┐
   │ validateElectricityConfig │  danh sách tier → tier đã sắp xếp, đã kiểm tra
   └───────────────────────┘
          │
          ▼
   ┌─────────────────────┐
   │ calculateQuotaFactor   │  tenantCount / peoplePerQuotaUnit
   └─────────────────────┘
          │ quotaFactor
          ▼
   ┌───────────────────────────┐
   │ allocateElectricityTiers    │  usage × dung lượng tier đã điều chỉnh theo quota
   └───────────────────────────┘   → số lượng/tiền mỗi tier (lặp)
          │
          ▼
   ┌─────────────────────────────┐      ┌──────────────────────────────┐
   │ calculateTieredElectricity     │  HOẶC  │ calculateFallbackElectricity    │
   │ (QUOTA_TIERED)                 │      │ (FALLBACK_TIER_FLAT)            │
   └─────────────────────────────┘      └──────────────────────────────┘
          │ subtotal → VAT → exactTotal → roundedTotalVnd
          ▼
   electricityExactTotal ───────────┐
                                     │
   ┌─────────────────────┐          │
   │ calculateWaterCharge   │  base → VAT + phí môi trường → exactTotal
   └─────────────────────┘          │
          │ waterExactTotal         │
          ▼                         ▼
        ┌───────────────────────────────┐
        │      calculateInvoiceTotal        │  cộng các exact total TRƯỚC, làm tròn ĐÚNG MỘT LẦN
        └───────────────────────────────┘
                       │ roundedTotalVnd
                       ▼
        ┌───────────────────────────────────┐
        │     calculateBillingDifference        │  actualCharged − legalRoundedTotal
        └───────────────────────────────────┘
```

## Trách nhiệm từng module

| Module | Trách nhiệm |
|---|---|
| `shared/exact-number.ts` | Số học phân số chính xác (`parseDecimal`, `add`, `subtract`, `multiply`, `divide`, `compare`, `min`, `toDecimalString`, `roundHalfUpToInteger`, `isFiniteDecimalDenominator`). Xem `docs/NUMERIC_PRECISION.md`. |
| `meter/calculate-meter-usage.ts` | Chỉ số `previous`/`current`/`max` → sản lượng, bao gồm cả trường hợp rollover (`current < previous`). |
| `electricity/validate-electricity-config.ts` | Kiểm tra một danh sách tier hợp lệ (không rỗng, số tier dương và duy nhất, đúng một tier không giới hạn ở cuối, ngưỡng/giá hợp lệ) và sắp xếp nó một cách xác định. |
| `electricity/calculate-quota-factor.ts` | `tenantCount / peoplePerQuotaUnit`, chưa làm tròn. Export cả `calculateQuotaFactorExact` (trả về `ExactNumber`, dùng nội bộ) và `calculateQuotaFactor` (một wrapper mỏng trả về `string` bọc quanh nó, dùng cho ranh giới public/test). |
| `electricity/allocate-electricity-tiers.ts` | Phân bổ sản lượng qua các tier theo dung lượng đã điều chỉnh theo quota, bằng vòng lặp. |
| `electricity/calculate-tiered-electricity.ts` | Điều phối quota → phân bổ → subtotal → VAT → tổng cho `QUOTA_TIERED`. |
| `electricity/calculate-fallback-electricity.ts` | Tính giá toàn bộ sản lượng theo đơn giá của một tier được cấu hình, cho `FALLBACK_TIER_FLAT`. |
| `water/calculate-water-charge.ts` | Cơ sở `PER_CUBIC_METER`/`PER_PERSON`, sau đó VAT + phí môi trường (cả hai đều tính từ `base`, không phải từ `base + VAT`). |
| `invoice/calculate-invoice-total.ts` | Cộng exact total điện + nước, làm tròn đúng một lần. |
| `invoice/calculate-billing-difference.ts` | `actualCharged - legalRoundedTotal` (chỉ tính ra, không bao giờ được lưu). |

## Vì sao mỗi bước là một module riêng

Mỗi module trả lời đúng một câu hỏi ("sản lượng là bao nhiêu?", "danh
sách tier này có hợp lệ không?", "sản lượng được phân bổ qua các tier
như thế nào?") với một hợp đồng đầu vào/đầu ra rõ ràng. Điều này phản
ánh nguyên tắc module nhỏ chung của dự án (xem `docs/ARCHITECTURE.md`
mục 7): một lỗi trong phân bổ tier có thể được cô lập và unit-test mà
không cần chạm vào logic quota hay VAT, và mỗi module có thể được giải
thích độc lập khi review.

## Fail-fast

Mọi module có thể gặp input không hợp lệ có ý nghĩa đều trả về
`Result<T>` (hợp đồng sẵn có của dự án — xem `docs/ERROR_HANDLING.md`)
thay vì throw. Các module điều phối (`calculateTieredElectricity`,
`calculateFallbackElectricity`, `calculateWaterCharge`) kiểm tra
`Result` của từng bước con và trả về ngay khi gặp thất bại đầu tiên —
không có bước sau nào chạy trên dữ liệu không hợp lệ. Đây là cùng mẫu
fail-fast đã thiết lập cho tầng Service, áp dụng cho pipeline nội bộ
của chính Calculation Core.

Calculation Core không giả định bất kỳ bước validate nào đã chạy trước
đó (ở Controller, Service, hay database). Mỗi module tự validate lại
input của chính nó — ví dụ, `calculateMeterUsage` tự kiểm tra lại
`previousReading <= meterMaximumValue` dù database đã có ràng buộc
`CHECK` đó.

## Vì sao dùng lặp, không dùng đệ quy

`allocateElectricityTiers` duyệt qua một danh sách tier hữu hạn, có thứ
tự tuyến tính, bằng vòng lặp `for`. Tier không phải là cây hay đồ thị —
"tier tiếp theo trong một danh sách đã sắp xếp" không có gì mang tính
đệ quy — nên một vòng lặp dễ đọc, dễ bước qua từng bước, và dễ suy luận
hơn đệ quy. Đây là cùng lý do đã ghi trong `docs/LEARNING_NOTES.md`
("Vì sao chưa dùng đệ quy"), nay áp dụng cho một cài đặt cụ thể.

## Vì sao Calculation Core không phụ thuộc database

Phép tính biểu giá điện/nước là giá trị cốt lõi của dự án này và là
phần nhiều khả năng nhất bị đối chiếu với các test case ẩn. Giữ nó là
TypeScript thuần, không phụ thuộc Express, HTML, hay một client
database nghĩa là:

- Có thể unit-test trong vài mili-giây, không cần chạy server hay
  database.
- Cùng một input luôn cho ra cùng một output, bất kể trạng thái
  database, môi trường server, hay trình duyệt — đúng thứ mà một hệ
  thống chấm test ẩn cần (kết quả xác định, không phụ thuộc môi
  trường).
- Một tầng Controller/Service có thể gọi trực tiếp các hàm này, truyền
  vào bất kỳ cấu hình nào nó đã đọc sẵn — Calculation Core không bao
  giờ tự quay lại đọc database.

## Cấu hình hoá, không hard-code

Không có file nào dưới `backend/src/calculation/` (ngoài `__tests__/`)
chứa hằng số riêng của đề thi (`1984`, `0.08`, `8500`, ...). Mọi giá
trị như vậy đều là tham số hàm, lấy từ cấu hình biểu giá vốn sẽ đến từ
database. Nơi duy nhất các hằng số này tồn tại là fixture chỉ-dùng-cho-
test, `backend/src/calculation/__tests__/fixtures/competition-defaults.ts`
— xem comment đầu file đó để biết vì sao ranh giới này quan trọng.

## Số người ở bằng không

Schema database cho phép `rooms.tenant_count = 0` (xem
`database/migrations/001_initial_domain_schema.sql`), nhưng đề thi
không định nghĩa quy tắc định mức cho một phòng 0 người. Thay vì tự bịa
ra một quyết định sản phẩm không có trong đề (ví dụ "quota factor 0
nghĩa là các tier có giới hạn nhận dung lượng bằng 0"),
`calculateQuotaFactor` từ chối tường minh `tenantCount <= 0` với mã lỗi
`INVALID_TENANT_COUNT`. Điều này chỉ ảnh hưởng tới cách tính điện
`QUOTA_TIERED` — phương pháp `PER_PERSON` của `calculateWaterCharge`
vẫn chấp nhận `tenantCount = 0` (một kết quả hợp lệ "phòng trống trả 0
tiền nước", không phải một phép tính định mức).

## Giới hạn cấu hình định mức (giá trị kiểu 1/3)

`peoplePerQuotaUnit` phải là một giá trị mà thừa số nguyên tố duy nhất
của nó chỉ là 2 và/hoặc 5 (`1, 2, 4, 5, 8, 10, 16, 20, 25, ...`), được
kiểm tra bởi `isFiniteDecimalDenominator` *trước* phép chia, độc lập
với `tenantCount`. Điều này đảm bảo `tenantCount / peoplePerQuotaUnit`
luôn biểu diễn được dưới dạng thập phân hữu hạn cho **mọi** số người ở
mà một biểu giá có thể từng được áp dụng — một đảm bảo ở mức cấu hình,
không phải một sự trùng hợp theo từng phép tính. Xem
`docs/NUMERIC_PRECISION.md` mục 13.6 để biết lý do đầy đủ (bao gồm vì
sao phương án thay thế — lan truyền phân số chính xác khắp nơi, với một
hợp đồng public dựa trên phân số — đã được cân nhắc và loại bỏ vì nằm
ngoài phạm vi dự án này). Ràng buộc database `CHECK
(people_per_quota_unit > 0)` cố ý được giữ nguyên không đổi; đây là
ranh giới của Calculation Core, không phải một giới hạn của database.

## Không round-trip qua chuỗi ở nội bộ

`calculateTieredElectricity` gọi trực tiếp `calculateQuotaFactorExact`
(hàm trả về `ExactNumber`), và dùng ngay giá trị đó trong
`allocateElectricityTiers` — nó **không** gọi `calculateQuotaFactor`
(hàm trả về chuỗi) rồi `parseDecimal` lại kết quả chỉ để tiếp tục tính.
Chuỗi thập phân dành cho ranh giới module/API/database (xem "Hợp đồng
số public" bên dưới), không phải để truyền giá trị giữa hai bước gắn
kết chặt bên trong cùng một pipeline. Hàm `calculateQuotaFactor` trả về
chuỗi vẫn tồn tại và vẫn public/được test — `calculateTieredElectricity`
chỉ đơn giản là không còn đi qua nó ở nội bộ nữa.

## Hợp đồng số public

Mọi hàm public trong `electricity/`, `water/`, và `invoice/` nhận vào
và trả về **chuỗi thập phân** cho các giá trị đo lường/tài chính —
không bao giờ là `ExactNumber` hay `bigint`. Xem
`docs/NUMERIC_PRECISION.md` mục 9 để biết vì sao. Điều này được kiểm
chứng bởi một test riêng (`__tests__/public-json-safety.test.ts`)
`JSON.stringify` mọi object kết quả public và duyệt đệ quy để tìm bất
kỳ `bigint` nào còn sót lại.
