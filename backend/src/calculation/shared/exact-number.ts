// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../shared/result";

/**
 * Trách nhiệm:
 * Biểu diễn số thập phân CHÍNH XÁC TUYỆT ĐỐI dưới dạng phân số
 * (numerator/denominator), dùng BigInt cho cả tử số và mẫu số. Đây là
 * nền tảng số học cho toàn bộ Calculation Core — thay thế hoàn toàn
 * `number` (IEEE-754) ở mọi phép tính tài chính/đo lường.
 *
 * Input: chuỗi thập phân (ví dụ "62.5", "0.08", "1984") ở ranh giới vào.
 * Output: chuỗi thập phân chuẩn hoá ở ranh giới ra (`toDecimalString`).
 *
 * Không chịu trách nhiệm:
 * - triển khai một thư viện toán học tổng quát (không sin/cos/log/luỹ
 *   thừa/ma trận). Đây chỉ là công cụ số học cho hoá đơn.
 * - lộ BigInt ra ngoài Calculation Core. `ExactNumber` là chi tiết cài
 *   đặt NỘI BỘ — mọi hàm public của Calculation Core (ở các module
 *   electricity/water/invoice) trả về `string`, không trả về
 *   `ExactNumber`, vì BigInt không thể JSON.stringify được và vì giữ
 *   ranh giới rõ ràng giữa "bên trong tính toán chính xác" và "bên
 *   ngoài giao tiếp qua JSON/PostgreSQL NUMERIC".
 * - hỗ trợ số thập phân tuần hoàn vô hạn (ví dụ 1/3). `toDecimalString`
 *   NÉM LỖI (throw) nếu phân số không có biểu diễn thập phân hữu hạn —
 *   xem chi tiết trong docs/NUMERIC_PRECISION.md. Toàn bộ dữ liệu hợp
 *   lệ của dự án (giá tiền, tỉ lệ thuế/phí từ PostgreSQL NUMERIC, ngưỡng
 *   bậc thang) đều là số thập phân hữu hạn nên không gặp trường hợp
 *   này; nơi DUY NHẤT có phép chia (calculateQuotaFactor) chủ động
 *   kiểm tra TRƯỚC bằng `isFiniteDecimalDenominator` (không phải bắt
 *   throw sau khi đã thử) — xem electricity/calculate-quota-factor.ts.
 *   `throw` ở đây do đó là một assertion nội bộ thực sự không thể xảy
 *   ra được nữa từ dữ liệu nghiệp vụ hợp lệ, không phải một đường xử lý
 *   lỗi đang được trông đợi.
 *
 * Lý do tồn tại:
 * Mọi module tính toán khác (meter, electricity, water, invoice) đều
 * phụ thuộc vào các phép toán ở đây. Tách riêng để logic số học chính
 * xác được viết, đọc, và unit-test MỘT LẦN duy nhất, không lặp lại rải
 * rác trong từng công thức nghiệp vụ.
 *
 * Invariant quan trọng:
 * `denominator` LUÔN LUÔN dương (> 0). Dấu của phân số nằm hoàn toàn ở
 * `numerator`. Phân số luôn được rút gọn về dạng tối giản bằng GCD
 * (ước chung lớn nhất) ngay khi tạo ra — không có hai cách biểu diễn
 * khác nhau cho cùng một giá trị (ví dụ 625/10 luôn được rút gọn thành
 * 125/2), giúp so sánh và định dạng ra chuỗi đơn giản, dễ kiểm chứng.
 */
export interface ExactNumber {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

export const ZERO: ExactNumber = { numerator: 0n, denominator: 1n };
export const ONE: ExactNumber = { numerator: 1n, denominator: 1n };

/** Dựng ExactNumber từ một số nguyên BigInt (dùng nội bộ trong Calculation Core). */
export function fromBigInt(value: bigint): ExactNumber {
  return { numerator: value, denominator: 1n };
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    [x, y] = [y, x % y];
  }
  return x;
}

/**
 * Rút gọn một phân số về dạng tối giản, đảm bảo denominator > 0.
 * Không export — mọi phân số đi ra khỏi module này đều đã qua normalize.
 */
function normalize(numerator: bigint, denominator: bigint): ExactNumber {
  if (numerator === 0n) {
    return ZERO;
  }
  let n = numerator;
  let d = denominator;
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const divisor = gcd(n, d);
  return { numerator: n / divisor, denominator: d / divisor };
}

const DECIMAL_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;

/**
 * Đọc một chuỗi thập phân THÔNG THƯỜNG (ví dụ "50", "-12.3", "0.08")
 * thành ExactNumber chính xác tuyệt đối.
 *
 * Không chịu trách nhiệm:
 * - đi qua `Number(...)`/`parseFloat(...)` trước khi tạo phân số — làm
 *   vậy sẽ tái nhiễm sai số dấu phẩy động TRƯỚC cả khi bước vào biểu
 *   diễn chính xác, phá hỏng mục đích của toàn bộ module này. Chuỗi
 *   được tách thủ công bằng regex, ghép thành BigInt trực tiếp.
 * - chấp nhận ký hiệu khoa học (1e10), dấu "+", khoảng trắng, hay số
 *   thập phân thiếu chữ số trước/sau dấu chấm (".5" hay "5.") — đây là
 *   parser hẹp, có chủ đích, cho đúng định dạng NUMERIC/config của dự
 *   án, không phải parser số học tổng quát.
 */
export function parseDecimal(input: string): Result<ExactNumber> {
  const match = DECIMAL_PATTERN.exec(input);
  if (!match) {
    return fail("INVALID_DECIMAL", `Chuỗi thập phân không hợp lệ: "${input}"`);
  }
  const [, signPart, integerPart, fractionalPart] = match;
  const digits = integerPart + (fractionalPart ?? "");
  const magnitude = BigInt(digits);
  const numerator = signPart === "-" ? -magnitude : magnitude;
  const denominator = 10n ** BigInt(fractionalPart?.length ?? 0);
  return ok(normalize(numerator, denominator));
}

export function add(a: ExactNumber, b: ExactNumber): ExactNumber {
  return normalize(a.numerator * b.denominator + b.numerator * a.denominator, a.denominator * b.denominator);
}

export function subtract(a: ExactNumber, b: ExactNumber): ExactNumber {
  return normalize(a.numerator * b.denominator - b.numerator * a.denominator, a.denominator * b.denominator);
}

export function multiply(a: ExactNumber, b: ExactNumber): ExactNumber {
  return normalize(a.numerator * b.numerator, a.denominator * b.denominator);
}

/**
 * Phép chia là NƠI DUY NHẤT trong Calculation Core có thể tạo ra một
 * phân số không có biểu diễn thập phân hữu hạn (ví dụ chia cho 3), và
 * là nơi duy nhất phải xử lý chia cho 0 — vì vậy đây là phép toán DUY
 * NHẤT trong module này trả về Result thay vì ExactNumber trực tiếp.
 */
export function divide(a: ExactNumber, b: ExactNumber): Result<ExactNumber> {
  if (b.numerator === 0n) {
    return fail("DIVISION_BY_ZERO", "Không thể chia cho 0.");
  }
  return ok(normalize(a.numerator * b.denominator, a.denominator * b.numerator));
}

export function compare(a: ExactNumber, b: ExactNumber): -1 | 0 | 1 {
  const left = a.numerator * b.denominator;
  const right = b.numerator * a.denominator;
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function min(a: ExactNumber, b: ExactNumber): ExactNumber {
  return compare(a, b) <= 0 ? a : b;
}

/**
 * Tách hết thừa số 2 và 5 khỏi một số nguyên dương, trả về phần dư.
 * Một phân số tối giản n/d có biểu diễn thập phân HỮU HẠN khi và chỉ
 * khi d chỉ có ước nguyên tố 2 và/hoặc 5 (vì hệ thập phân = 2 × 5).
 * Nếu remainder khác 1 sau khi tách, d còn ước nguyên tố khác — phân
 * số đó là số thập phân TUẦN HOÀN VÔ HẠN, không có chuỗi thập phân hữu
 * hạn để trả về.
 */
function factorOutTwosAndFives(value: bigint): { twos: number; fives: number; remainder: bigint } {
  let remainder = value;
  let twos = 0;
  while (remainder % 2n === 0n) {
    remainder /= 2n;
    twos++;
  }
  let fives = 0;
  while (remainder % 5n === 0n) {
    remainder /= 5n;
    fives++;
  }
  return { twos, fives, remainder };
}

/**
 * Kiểm tra một số nguyên dương CÓ THỂ làm mẫu số của một phân số thập
 * phân hữu hạn hay không — đúng khi và chỉ khi ước nguyên tố của nó chỉ
 * gồm 2 và/hoặc 5 (ví dụ 1, 2, 4, 5, 8, 10, 16, 20, 25, ...).
 *
 * Dùng để xác nhận TRƯỚC một tham số cấu hình (ví dụ
 * peoplePerQuotaUnit) sẽ LUÔN tạo ra thương số hữu hạn với MỌI tử số
 * nguyên — không chỉ kiểm tra SAU khi đã chia một tử số cụ thể. Xem
 * electricity/calculate-quota-factor.ts, nơi hàm này được dùng để biến
 * "thử rồi bắt lỗi nếu không hữu hạn" thành một ràng buộc tường minh,
 * độc lập với tenantCount.
 */
export function isFiniteDecimalDenominator(value: bigint): boolean {
  if (value <= 0n) {
    return false;
  }
  return factorOutTwosAndFives(value).remainder === 1n;
}

/**
 * Chuyển ExactNumber về chuỗi thập phân chuẩn hoá (canonical), KHÔNG có
 * số 0 thừa ở cuối phần thập phân — ví dụ "62.500" không xuất hiện, chỉ
 * "62.5". Số nguyên trả về không có dấu chấm (ví dụ "19944", không phải
 * "19944.0" hay "19944.").
 *
 * Throws (không phải Result) khi phân số không có biểu diễn thập phân
 * hữu hạn — xem giải thích "Không chịu trách nhiệm" ở đầu file. Đây là một assertion
 * nội bộ (lỗi lập trình/cấu hình nằm ngoài phạm vi hỗ trợ), không phải
 * một lỗi nghiệp vụ mong đợi cần Result — mọi đường dẫn có khả năng gặp
 * trường hợp này (calculateQuotaFactor) đã tự bắt và chuyển thành
 * Result thất bại trước khi lỗi này có cơ hội thoát ra ngoài.
 */
export function toDecimalString(value: ExactNumber): string {
  if (value.numerator === 0n) {
    return "0";
  }
  const negative = value.numerator < 0n;
  const magnitude = negative ? -value.numerator : value.numerator;

  const { twos, fives, remainder } = factorOutTwosAndFives(value.denominator);
  if (remainder !== 1n) {
    throw new Error(
      `ExactNumber.toDecimalString: phân số ${value.numerator}/${value.denominator} là số thập phân tuần hoàn vô hạn, không có chuỗi thập phân hữu hạn để biểu diễn.`
    );
  }

  const scale = twos > fives ? twos : fives;
  if (scale === 0) {
    return (negative ? "-" : "") + magnitude.toString();
  }

  const pow10 = 10n ** BigInt(scale);
  // Chính xác tuyệt đối: theo cách xây dựng scale ở trên, denominator
  // luôn chia hết pow10 * magnitude, không có phần dư.
  const scaledNumerator = (magnitude * pow10) / value.denominator;

  let digits = scaledNumerator.toString();
  while (digits.length <= scale) {
    digits = "0" + digits;
  }
  const integerPart = digits.slice(0, digits.length - scale);
  const fractionalPart = digits.slice(digits.length - scale).replace(/0+$/, "");

  const body = fractionalPart.length > 0 ? `${integerPart}.${fractionalPart}` : integerPart;
  return (negative ? "-" : "") + body;
}

/**
 * Làm tròn HALF-UP về số nguyên — quy tắc làm tròn tài chính duy nhất
 * của dự án, áp dụng ĐÚNG MỘT LẦN ở bước cuối cùng của mỗi phép tính
 * (xem docs/NUMERIC_PRECISION.md).
 *
 * Quy tắc: phần dư >= một nửa mẫu số thì làm tròn lên, ngược lại làm
 * tròn xuống. So sánh được thực hiện bằng phép toán BigInt nguyên
 * (remainder * 2n >= denominator), không dùng Math.round — Math.round
 * nhận `number`, nghĩa là giá trị đã phải ép về dấu phẩy động (có thể
 * đã mang sai số từ các bước trước) trước khi làm tròn, đi ngược lại
 * toàn bộ mục đích của Calculation Core.
 *
 * Không chịu trách nhiệm: hỗ trợ giá trị âm. Mọi số tiền trong dự án này không bao
 * giờ âm (usage, giá, thuế, phí đều >= 0); hàm throw nếu vi phạm giả
 * định này — đây là lỗi lập trình nội bộ cần sửa code, không phải một
 * input nghiệp vụ hợp lệ cần Result.
 */
export function roundHalfUpToInteger(value: ExactNumber): bigint {
  if (value.numerator < 0n) {
    throw new Error("roundHalfUpToInteger: chỉ hỗ trợ giá trị không âm (số tiền hoá đơn không bao giờ âm trong dự án này).");
  }
  const quotient = value.numerator / value.denominator;
  const remainder = value.numerator - quotient * value.denominator;
  return remainder * 2n >= value.denominator ? quotient + 1n : quotient;
}
