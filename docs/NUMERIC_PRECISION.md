# Numeric Precision

Tài liệu này giải thích chiến lược số học của Calculation Core — vì sao
dự án không dùng `number` (JavaScript floating-point) cho các phép tính
tài chính, và cách `BigInt` + phân số chính xác giải quyết vấn đề đó.
Viết bằng tiếng Việt, phục vụ trực tiếp cho buổi bảo vệ đồ án.

## 1. Vấn đề của IEEE-754 `number`

JavaScript/TypeScript `number` là số thực dấu phẩy động nhị phân 64-bit
(IEEE-754 double) — máy tính lưu số bằng hệ nhị phân, và một số phân số
thập phân rất đơn giản trong hệ thập phân (như `0.1`) **không thể biểu
diễn chính xác** bằng một chuỗi hữu hạn chữ số nhị phân, giống như `1/3`
không viết hết được trong hệ thập phân.

```js
0.1 + 0.2 === 0.3   // false
0.1 + 0.2           // 0.30000000000000004
```

Với ứng dụng thông thường, sai số cỡ 10⁻¹⁷ không ai để ý. Nhưng với hoá
đơn tiền — nơi kỳ thi chấm chính xác từng đồng — một sai số dù cực nhỏ ở
bước trung gian có thể khiến kết quả cuối lệch khỏi đáp án chính thức.
Các giá trị dễ bị ảnh hưởng nhất trong bài toán này:

- Ngưỡng bậc thang sau khi nhân với quota: `62.5`, `12.5` kWh.
- Thuế/phí: VAT điện `0.08`, VAT nước `0.05`, phí môi trường `0.10`.
- Số tiền trung gian: `139905`, `11192.4`.

## 2. Vì sao làm tròn sớm là SAI, không chỉ là "không đẹp"

Quy tắc của kỳ thi:

- **Giữ nguyên** độ chính xác thập phân ở mọi bước trung gian.
- **Không** làm tròn ngưỡng bậc thang.
- **Không** làm tròn từng khoản tiền trung gian.
- **Chỉ** làm tròn MỘT LẦN, ở tổng hoá đơn cuối cùng, theo half-up.

Ví dụ: 1 người, 60 kWh, quota = 1/4 = 0.25. Ngưỡng các bậc sau điều
chỉnh: `12.5`, `12.5`, `25`, ... Nếu làm tròn ngưỡng sớm (`12.5 -> 13`),
số kWh được phân vào mỗi bậc sẽ khác đi, kéo theo `amount` của từng bậc
sai, và tổng cuối cùng sai theo — đây là lỗi **đúng/sai**, không phải
vấn đề định dạng hiển thị.

## 3. `BigInt`

`BigInt` là kiểu có sẵn trong JavaScript/TypeScript, biểu diễn **số
nguyên chính xác tuyệt đối**, không giới hạn độ lớn:

```ts
const a: bigint = 123n;
const b = 99999n + 1n; // 100000n — chính xác tuyệt đối
```

`BigInt` **chỉ** biểu diễn số nguyên — `62.5n` là cú pháp không hợp lệ.
Tự thân `BigInt` chưa đủ để giải quyết bài toán; cần thêm một lớp biểu
diễn phân số bên trên nó.

## 4. Biểu diễn phân số chính xác (`ExactNumber`)

Mọi số thập phân hữu hạn đều viết được thành một phân số đúng — tử số và
mẫu số đều là số nguyên. `backend/src/calculation/shared/exact-number.ts`
định nghĩa:

```ts
interface ExactNumber {
  numerator: bigint;
  denominator: bigint; // luôn > 0
}
```

| Số thập phân | Phân số | Rút gọn (GCD) |
|---|---|---|
| `50` | 50/1 | 50/1 |
| `62.5` | 625/10 | 125/2 |
| `0.08` | 8/100 | 2/25 |
| `0.05` | 5/100 | 1/20 |
| `11192.4` | 111924/10 | 55962/5 |

Phân số luôn được rút gọn ngay khi tạo ra (dùng GCD — ước chung lớn
nhất), nên mỗi giá trị chỉ có đúng một cách biểu diễn, dễ so sánh và
định dạng lại thành chuỗi.

## 5. Ví dụ 62.5 kWh × 1984 VNĐ/kWh

```
62.5  = 125/2
1984  = 1984/1

125 × 1984     248000
----------  =  ------  =  124000
  2 × 1            2
```

Chính xác tuyệt đối — không có bước nào phải "làm tròn tạm".

## 6. Ví dụ VAT: 139905 × 0.08

```
0.08 = 2/25

139905 × 2      279810
-----------  =  -------  =  11192.4
    25             25
```

Vẫn là một phân số chính xác (`111924/10`, không phải số gần đúng). Cộng
tiếp `139905 + 11192.4 = 151097.4` — CHỈ đến đây, bước cuối cùng, mới
làm tròn.

## 7. Vì sao Calculation Core parse chuỗi thủ công, không qua `Number(...)`

`shared/exact-number.ts` — hàm `parseDecimal` — tách chuỗi thập phân
bằng regex và ghép trực tiếp thành `BigInt`, **không bao giờ** đi qua
`Number(value)` hay `parseFloat(value)` trước. Nếu đi qua `Number(...)`
trước, sai số dấu phẩy động đã xâm nhập TRƯỚC KHI giá trị kịp trở thành
phân số chính xác — phá hỏng toàn bộ mục đích của module này. Đây là lý
do `Number(...)`/`parseFloat(...)` bị liệt vào danh sách cấm trong mọi
đường dẫn tính toán tài chính của Calculation Core.

## 8. GCD — chỉ ở mức khái niệm

Rút gọn phân số dùng thuật toán Euclid tìm ước chung lớn nhất (GCD):
lặp lại phép chia lấy dư giữa hai số cho tới khi dư bằng 0, số chia cuối
cùng chính là GCD. `62.5 = 625/10`, GCD(625, 10) = 5, rút gọn thành
`125/2`. Không cần đi sâu hơn mức này trừ khi được hỏi thêm lúc bảo vệ.

## 9. Ranh giới nội bộ vs. công khai (BigInt chỉ ở bên trong)

`BigInt` không thể `JSON.stringify` được:

```ts
JSON.stringify({ amount: 100n }); // TypeError
```

Vì vậy `ExactNumber`/`BigInt` **chỉ tồn tại bên trong** Calculation Core.
Mọi hàm public (ở `electricity/`, `water/`, `invoice/`) nhận vào và trả
ra **chuỗi thập phân chuẩn hoá** (`toDecimalString`), không bao giờ trả
`ExactNumber` hay `bigint` ra ngoài:

```
PostgreSQL NUMERIC
      ↕ (chuỗi thập phân, ví dụ "62.5")
Calculation Core — ExactNumber<BigInt> (nội bộ)
      ↕ (chuỗi thập phân, ví dụ "62.5")
REST API / JSON / frontend
```

Cách này giữ được độ chính xác tuyệt đối, an toàn cho JSON, và khớp với
cách PostgreSQL `NUMERIC` cũng dùng chuỗi ở ranh giới dữ liệu (xem
`docs/DATABASE_DESIGN.md` mục "NUMERIC vs FLOAT").

## 10. Vì sao không dùng decimal.js

`decimal.js` là một lựa chọn chuyên nghiệp, hợp lệ, được dùng rộng rãi
trong thực tế — không có gì sai khi chọn nó. Với dự án thi này, tập phép
toán thực sự cần chỉ có khoảng 8-9 hàm nhỏ (cộng/trừ/nhân/chia/so
sánh/parse/format/làm tròn). Viết tay bằng `BigInt` giúp:

- Không thêm dependency mới.
- Tự giải thích được TỪNG dòng khi bảo vệ đồ án, thay vì phải tin tưởng
  logic bên trong một thư viện ngoài.
- Đủ nhỏ để review, test, và hiểu toàn bộ trong một buổi.

Đánh đổi: nhiều code hơn một chút so với gọi thẳng API của `decimal.js`.
Với quy mô bài toán này, sự minh bạch quan trọng hơn số dòng code tiết
kiệm được.

## 11. Độ chính xác trung gian

Không có bước tính toán nào trong pipeline (usage → quota → ngưỡng bậc
đã điều chỉnh → quantity từng bậc → amount từng bậc → subtotal → VAT →
exactTotal) gọi `toDecimalString`/làm tròn giữa chừng — mọi phép cộng/
trừ/nhân đều thao tác trực tiếp trên `ExactNumber`, chỉ chuyển sang
chuỗi ở đầu ra CUỐI CÙNG của mỗi hàm public.

## 12. Làm tròn half-up — MỘT LẦN duy nhất

```
151096.4 -> 151096   (phần thập phân 0.4 < 0.5, làm tròn xuống)
151096.5 -> 151097   (phần thập phân 0.5 >= 0.5, làm tròn lên)
151096.6 -> 151097   (phần thập phân 0.6 >= 0.5, làm tròn lên)
```

`roundHalfUpToInteger` (trong `shared/exact-number.ts`) so sánh phần dư
với một nửa mẫu số bằng phép toán `BigInt` nguyên
(`remainder * 2n >= denominator`), không dùng `Math.round`.
`Math.round` nhận vào `number` — nghĩa là giá trị đã phải ép về dấu phẩy
động (có thể đã mang sai số từ các bước trước) trước khi làm tròn.
`Math.round` che giấu vấn đề thay vì giải quyết nó; hàm tự viết trên có
thể kiểm chứng và giải thích từng bước bằng số học nguyên.

## 13. Tóm tắt

| Giá trị | Kiểu | Vì sao |
|---|---|---|
| kWh, m³, tiền, tỉ lệ thuế/phí, quota, ngưỡng bậc | `ExactNumber` (nội bộ) / `string` (ranh giới) | Có thể mang phần thập phân, cần chính xác tuyệt đối |
| `tenantCount`, `tierNumber`, `fallbackTierNumber` | `number` | Số đếm nguyên an toàn, không liên quan phép chia/nhân tài chính |

Xem `docs/CALCULATION_CORE.md` cho pipeline tính toán đầy đủ và
`docs/LEARNING_NOTES.md` cho lý do chọn kiến trúc tổng thể của dự án.
