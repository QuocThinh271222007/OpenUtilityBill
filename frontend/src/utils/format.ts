// SPDX-License-Identifier: MIT

/**
 * Trách nhiệm:
 * Các hàm THUẦN TUÝ (pure — không DOM, không I/O) xử lý chuỗi cho toàn
 * frontend: escape HTML, định dạng hiển thị tiền VNĐ, chuyển đổi
 * tháng<->billingPeriod, và phân loại dấu của một chuỗi số (để tô màu
 * "chênh lệch"). Tách khỏi views/ để có thể kiểm chứng độc lập bằng
 * unit test thuần, không cần DOM.
 *
 * Important invariant (áp dụng cho MỌI hàm trong file này):
 * KHÔNG BAO GIỜ dùng `Number(...)`/`parseFloat(...)`/`Math.round(...)`
 * trên một giá trị tài chính/đo lường — mọi hàm ở đây chỉ thao tác
 * CHUỖI (string), giữ nguyên độ chính xác tuyệt đối mà backend đã trả
 * về (xem docs/FRONTEND.md mục "Quy tắc chuỗi tài chính (quan trọng)").
 *
 * Không chịu trách nhiệm:
 * - tính toán bất kỳ giá trị tài chính nào (cộng/trừ/nhân/chia) — chỉ
 *   ĐỊNH DẠNG HIỂN THỊ những giá trị backend đã tính sẵn.
 */

/**
 * Escape một chuỗi trước khi nội suy vào template HTML — dùng ở MỌI
 * nơi views/ chèn text đến từ backend/người dùng (tên cơ sở, tên phòng,
 * địa chỉ, tên biểu giá, mô tả dòng hoá đơn, ...) vào một chuỗi HTML,
 * để không tin tưởng dữ liệu đó chỉ vì nó đến từ backend của chính dự
 * án (xem docs/FRONTEND.md mục "Escape HTML").
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Nhóm chữ số hàng nghìn bằng dấu chấm, thuần thao tác CHUỖI (không đi
 * qua `Number`). Chỉ nhận chuỗi chỉ gồm chữ số (không dấu, không âm) —
 * dùng nội bộ bởi `formatVndDisplay`.
 */
function groupThousands(digits: string): string {
  const reversedChars = digits.split("").reverse();
  const groupedChars: string[] = [];
  for (let i = 0; i < reversedChars.length; i++) {
    if (i > 0 && i % 3 === 0) {
      groupedChars.push(".");
    }
    groupedChars.push(reversedChars[i]);
  }
  return groupedChars.reverse().join("");
}

/**
 * Chuyển một chuỗi thập phân (nguyên văn từ backend, ví dụ "366994.00",
 * "210756", "6.12", "-6.12") thành chuỗi hiển thị VNĐ có phân cách hàng
 * nghìn — ví dụ:
 *   "210756"    -> "210.756 ₫"
 *   "366994.00" -> "366.994 ₫"
 *   "6.12"      -> "6,12 ₫"
 *
 * Phần thập phân TOÀN SỐ 0 (ví dụ ".00") bị bỏ — VNĐ không có đơn vị
 * lẻ hơn đồng, và ".00" không mang thêm thông tin. Phần thập phân có
 * chữ số khác 0 (ví dụ "actualChargedAmount"/"billingDifference" có
 * thể có tới 2 chữ số lẻ) được GIỮ LẠI, ngăn cách bằng dấu phẩy theo
 * quy ước Việt Nam — không bị cắt bớt, không mất thông tin.
 *
 * Không chịu trách nhiệm: chuyển giá trị qua `Number` ở bất kỳ bước nào — chỉ tách
 * chuỗi tại dấu "." và nhóm lại.
 */
export function formatVndDisplay(value: string): string {
  const isNegative = value.startsWith("-");
  const unsigned = isNegative ? value.slice(1) : value;
  const [integerPart, fractionalPart] = unsigned.split(".");
  const grouped = groupThousands(integerPart);

  let display = grouped;
  if (fractionalPart) {
    const trimmedFractional = fractionalPart.replace(/0+$/, "");
    if (trimmedFractional.length > 0) {
      display += `,${trimmedFractional}`;
    }
  }

  return `${isNegative ? "-" : ""}${display} ₫`;
}

/**
 * "Hình dạng nhóm hàng nghìn hợp lệ" — nhóm ĐẦU dài 1-3 chữ số, MỌI
 * nhóm SAU đó dài ĐÚNG 3 chữ số (ví dụ `["40","000"]`, `["1","984"]`,
 * `["40","000","000"]`). Dùng để phân biệt một dấu "." là DẤU NGĂN HÀNG
 * NGHÌN (khi paste một giá trị đã định dạng, ví dụ "40.000") hay là
 * DẤU THẬP PHÂN (khi đây là một giá trị canonical từ backend, ví dụ
 * "40000.50" — nhóm sau dấu "." dài 2, không phải 3, nên KHÔNG khớp
 * hình dạng này).
 */
function isThousandsGroupedShape(groups: string[]): boolean {
  if (groups.length < 2) return false;
  if (groups[0].length === 0 || groups[0].length > 3) return false;
  return groups.slice(1).every((group) => group.length === 3 && /^\d+$/.test(group));
}

/**
 * Ba phần "ý định" của một giá trị tiền: chữ số phần nguyên, chữ số
 * phần lẻ (tối đa 2, khớp `NUMERIC(14, 2)`), và có/không có dấu thập
 * phân. Đây là mô hình DỮ LIỆU trung gian — dùng để RENDER lại
 * (`formatMoneyParts`) hoặc để một ô nhập liệu có trạng thái
 * (`utils/money-input.ts`) lưu/cập nhật state chính xác theo từng phím
 * gõ, tách biệt khỏi việc "đoán" từ một chuỗi đã trộn lẫn ký hiệu.
 */
export interface MoneyInputParts {
  integerDigits: string;
  fractionalDigits: string;
  hasDecimal: boolean;
}

/**
 * Diễn giải MỘT CHUỖI HOÀN CHỈNH thành `MoneyInputParts` — nhận CẢ một
 * chuỗi canonical thô từ backend (ví dụ "40000.50", "8500.00", dấu "."
 * LUÔN là thập phân) LẪN một chuỗi đã ở dạng hiển thị/vừa paste (ví dụ
 * "40.000", "40.000,50", dấu "." có thể là ngăn hàng nghìn) — xem
 * `isThousandsGroupedShape` để biết cách hai trường hợp được phân
 * biệt.
 *
 * CHÚ Ý cho nơi gọi: hàm này áp dụng "quy tắc chuỗi hoàn chỉnh" (dấu
 * cuối cùng gặp được là phân định thập phân, trừ khi TOÀN chuỗi khớp
 * hình dạng nhóm-hàng-nghìn) — chỉ đúng khi chuỗi đầu vào là MỘT giá
 * trị TRỌN VẸN (canonical nạp sẵn, hoặc nội dung dán một lần). KHÔNG
 * dùng hàm này để diễn giải lại giá trị DOM đang gõ dở theo từng phím
 * — một dấu "." do CHÍNH `formatMoneyParts` chèn ở lượt gõ trước có
 * thể trở nên lệch vị trí sau khi gõ thêm chữ số (ví dụ "4.000" rồi gõ
 * thêm "0" thành "4.0000" — không còn đúng 3 chữ số sau dấu "."). Việc
 * gõ theo từng phím phải cập nhật trực tiếp `MoneyInputParts` đã lưu
 * (xem `utils/money-input.ts`), không re-parse chuỗi đã trộn ký hiệu.
 */
export function parseMoneyInputParts(rawCanonicalOrDisplay: string): MoneyInputParts {
  const cleaned = rawCanonicalOrDisplay.replace(/[^0-9.,]/g, "");
  if (cleaned.length === 0) return { integerDigits: "", fractionalDigits: "", hasDecimal: false };

  if (cleaned.includes(",")) {
    const firstCommaIndex = cleaned.indexOf(",");
    return {
      integerDigits: cleaned.slice(0, firstCommaIndex).replace(/\D/g, ""),
      fractionalDigits: cleaned.slice(firstCommaIndex + 1).replace(/\D/g, "").slice(0, 2),
      hasDecimal: true,
    };
  }
  if (cleaned.includes(".")) {
    const groups = cleaned.split(".");
    if (isThousandsGroupedShape(groups)) {
      return { integerDigits: groups.join(""), fractionalDigits: "", hasDecimal: false };
    }
    const lastDotIndex = cleaned.lastIndexOf(".");
    return {
      integerDigits: cleaned.slice(0, lastDotIndex).replace(/\./g, ""),
      fractionalDigits: cleaned.slice(lastDotIndex + 1).replace(/\./g, "").slice(0, 2),
      hasDecimal: true,
    };
  }
  return { integerDigits: cleaned, fractionalDigits: "", hasDecimal: false };
}

/**
 * Render `MoneyInputParts` thành chuỗi hiển thị — nhóm hàng nghìn bằng
 * "." và phần lẻ (nếu `hasDecimal`) bằng ",". KHÔNG BAO GIỜ dùng
 * `Number`/`parseFloat`. Đây là hướng NGƯỢC LẠI của việc diễn giải —
 * an toàn gọi lại nhiều lần liên tiếp vì chỉ thao tác trên dữ liệu đã
 * tách phần (integer/fractional/hasDecimal), không phải chuỗi đã trộn
 * ký hiệu.
 */
export function formatMoneyParts(parts: MoneyInputParts): string {
  let integerDigits = parts.integerDigits.replace(/^0+(?=\d)/, "");
  const fractionalDigits = parts.fractionalDigits.slice(0, 2);
  if (integerDigits.length === 0 && !parts.hasDecimal && fractionalDigits.length === 0) {
    return "";
  }
  if (integerDigits.length === 0) integerDigits = "0";

  const groupedInteger = groupThousands(integerDigits);
  return parts.hasDecimal ? `${groupedInteger},${fractionalDigits}` : groupedInteger;
}

/**
 * Định dạng MỘT CHUỖI HOÀN CHỈNH thành chuỗi hiển thị tiền — tương
 * đương `formatMoneyParts(parseMoneyInputParts(value))`. Dùng để nạp
 * sẵn một ô tiền từ giá trị canonical (khi mở form sửa) hoặc để xử lý
 * một lần dán (paste) nguyên chuỗi — xem lưu ý ở `parseMoneyInputParts`
 * về việc KHÔNG dùng hàm này để re-parse giá trị DOM đang gõ dở theo
 * từng phím.
 */
export function formatMoneyInputDisplay(rawCanonicalOrDisplay: string): string {
  return formatMoneyParts(parseMoneyInputParts(rawCanonicalOrDisplay));
}

/**
 * Đảo ngược `formatMoneyInputDisplay` — chuyển giá trị ĐANG HIỂN THỊ
 * trong ô nhập (do CHÍNH `formatMoneyInputDisplay`/`utils/money-input.ts`
 * kiểm soát, nên LUÔN ở dạng "." = hàng nghìn, "," = thập phân, không
 * mơ hồ) thành chuỗi canonical mà API cần. Trả `null` khi rỗng hoặc
 * không đúng hình dạng (ví dụ nhiều hơn một dấu ",").
 */
export function moneyDisplayToCanonical(displayValue: string): string | null {
  const trimmed = displayValue.trim();
  if (trimmed.length === 0) return null;
  const commaCount = (trimmed.match(/,/g) ?? []).length;
  if (commaCount > 1) return null;
  const withoutThousands = trimmed.replace(/\./g, "");
  if (!/^\d+(,\d+)?$/.test(withoutThousands)) return null;
  return withoutThousands.replace(",", ".");
}

/**
 * Dịch dấu thập phân của một chuỗi số (thuần chuỗi, KHÔNG qua `Number`)
 * — `shift` dương dịch PHẢI (nhân 10^shift), âm dịch TRÁI (chia
 * 10^-shift). Dùng nội bộ cho việc đổi qua lại giữa tỉ lệ canonical
 * (`"0.08"`) và phần trăm hiển thị (`"8"`) — CHỈ áp dụng cho các field
 * tỉ lệ (VAT/phí môi trường), KHÔNG dùng cho tiền (tiền dùng nhóm hàng
 * nghìn, không phải dịch thập phân).
 */
function shiftDecimalPointString(value: string, shift: number, trimTrailingFractionZeros: boolean): string {
  const isNegative = value.startsWith("-");
  const unsigned = isNegative ? value.slice(1) : value;
  const [intPartRaw, fracPartRaw = ""] = unsigned.split(".");
  const intPart = intPartRaw.replace(/\D/g, "") || "0";
  const fracPart = fracPartRaw.replace(/\D/g, "");
  const allDigits = intPart + fracPart;
  const pointIndex = intPart.length + shift;

  let resultIntPart: string;
  let resultFracPart: string;
  if (pointIndex <= 0) {
    resultIntPart = "0";
    resultFracPart = "0".repeat(-pointIndex) + allDigits;
  } else if (pointIndex >= allDigits.length) {
    resultIntPart = allDigits + "0".repeat(pointIndex - allDigits.length);
    resultFracPart = "";
  } else {
    resultIntPart = allDigits.slice(0, pointIndex);
    resultFracPart = allDigits.slice(pointIndex);
  }

  resultIntPart = resultIntPart.replace(/^0+(?=\d)/, "");
  if (trimTrailingFractionZeros) {
    resultFracPart = resultFracPart.replace(/0+$/, "");
  }

  const combined = resultFracPart.length > 0 ? `${resultIntPart}.${resultFracPart}` : resultIntPart;
  return (isNegative ? "-" : "") + combined;
}

/**
 * Người dùng nghĩ theo PHẦN TRĂM (ví dụ nhập "8" nghĩa là 8%) — chuyển
 * thành tỉ lệ canonical mà API cần (`"0.08"`), thuần dịch dấu thập
 * phân (chia 100), KHÔNG dùng phép toán số thực. Trả `null` nếu không
 * đúng hình dạng số thập phân không âm.
 *
 *   "8"   -> "0.08"
 *   "10"  -> "0.10"
 *   "8.5" -> "0.085"
 */
export function percentInputToRateCanonical(percentDisplay: string): string | null {
  const normalized = percentDisplay.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return shiftDecimalPointString(normalized, -2, false);
}

/**
 * Đảo ngược `percentInputToRateCanonical` — tỉ lệ canonical từ backend
 * (có thể ở scale đầy đủ của cột, ví dụ "0.0800") thành số phần trăm
 * hiển thị gọn ("8", không phải "8.00"). Dịch dấu thập phân (nhân
 * 100), giữ lại phần lẻ CÓ NGHĨA (ví dụ "0.085" -> "8.5").
 */
export function rateCanonicalToPercentDisplay(rateCanonical: string): string {
  return shiftDecimalPointString(rateCanonical, 2, true);
}

/**
 * Mask nhập liệu cho ngày đầy đủ — bỏ MỌI ký tự không phải chữ số
 * (thao tác thuần trên chuỗi, không có gì mơ hồ để "đoán" như dấu
 * thập phân của tiền), giữ tối đa 8 chữ số (DDMMYYYY), rồi tự chèn "/"
 * sau vị trí 2 và 4. An toàn gọi lại trên MỌI giá trị trung gian (kể
 * cả giá trị đã có "/" từ lượt gõ trước) vì luôn tính lại từ đầu dựa
 * trên SỐ LƯỢNG chữ số, không dựa vào vị trí "/" cũ. KHÔNG validate
 * lịch — xem `displayDateToIsoDate` cho việc đó.
 *
 *   "1"        -> "1"
 *   "10"       -> "10"
 *   "100"      -> "10/0"
 *   "1005"     -> "10/05"
 *   "10052025" -> "10/05/2025"
 */
export function formatDateInputMask(rawDigitsOrDisplay: string): string {
  const digits = rawDigitsOrDisplay.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/**
 * Mask nhập liệu cho kỳ billing (tháng) — cùng nguyên tắc với
 * `formatDateInputMask`, giữ tối đa 6 chữ số (MMYYYY), tự chèn "/" sau
 * vị trí 2. KHÔNG validate tháng 01-12 — xem `monthDisplayToBillingPeriod`
 * cho việc đó.
 *
 *   "10"     -> "10"
 *   "102"    -> "10/2"
 *   "102026" -> "10/2026"
 */
export function formatMonthInputMask(rawDigitsOrDisplay: string): string {
  const digits = rawDigitsOrDisplay.replace(/\D/g, "").slice(0, 6);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

/** "YYYY-MM-DD" -> "DD/MM/YYYY", thuần cắt chuỗi (không dựng `Date`, tránh mọi vấn đề múi giờ). Giá trị vào LUÔN đến từ backend, không cần validate. */
export function isoDateToDisplayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/** Số ngày thật của `month` (1-12) trong `year` — dùng để từ chối ngày không tồn tại (ví dụ 31/02). */
function daysInMonth(month: number, year: number): number {
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[month - 1];
}

/**
 * "DD/MM/YYYY" (người dùng nhập tay) -> "YYYY-MM-DD" (API), hoặc `null`
 * nếu KHÔNG đúng hình dạng chính xác hai chữ số ngày/hai chữ số
 * tháng/bốn chữ số năm, HOẶC ngày đó không tồn tại thật trên lịch (ví
 * dụ 31/02, 29/02 của năm không nhuận) — validate bằng phép tính lịch
 * thủ công, CỐ Ý không dùng `Date.parse`/`new Date(...)` (vốn chấp
 * nhận nhiều hình dạng mơ hồ và tự "sửa" ngày tràn tháng một cách âm
 * thầm, ví dụ `new Date(2026, 1, 31)` tự lùi thành tháng 3).
 */
export function displayDateToIsoDate(displayDate: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(displayDate.trim());
  if (!match) return null;
  const [, dayStr, monthStr, yearStr] = match;
  const day = Number(dayStr);
  const month = Number(monthStr);
  const year = Number(yearStr);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(month, year)) return null;
  return `${yearStr}-${monthStr}-${dayStr}`;
}

/**
 * "MM/YYYY" (người dùng nhập tay cho kỳ billing — CHỈ đại diện một
 * THÁNG, không phải một ngày cụ thể) -> `billingPeriod` ("YYYY-MM-DD",
 * luôn ngày 01) mà API cần, hoặc `null` nếu không đúng hình dạng hai
 * chữ số tháng (01-12)/bốn chữ số năm. CỐ Ý không dùng `Date.parse`.
 */
export function monthDisplayToBillingPeriod(monthDisplay: string): string | null {
  const match = /^(\d{2})\/(\d{4})$/.exec(monthDisplay.trim());
  if (!match) return null;
  const [, monthStr, yearStr] = match;
  const month = Number(monthStr);
  if (month < 1 || month > 12) return null;
  return `${yearStr}-${monthStr}-01`;
}

/** `billingPeriod` ("YYYY-MM-DD") -> "MM/YYYY", thuần cắt chuỗi — giá trị vào LUÔN đến từ backend, không cần validate. */
export function billingPeriodToMonthDisplay(billingPeriod: string): string {
  return `${billingPeriod.slice(5, 7)}/${billingPeriod.slice(0, 4)}`;
}

export type BillingDifferenceStatus = "over" | "under" | "exact";

/**
 * Phân loại DẤU của một chuỗi chênh lệch tiền (`billingDifference`) đã
 * backend tính sẵn — CHỈ kiểm tra HÌNH DẠNG chuỗi (bắt đầu bằng "-",
 * hay toàn chữ số 0), KHÔNG BAO GIỜ `parseFloat`/`Number` để so sánh
 * với 0 (xem docs/CREATE_INVOICE_WORKFLOW.md mục "actualChargedAmount /
 * chênh lệch hoá đơn").
 */
export function classifyBillingDifference(differenceValue: string): BillingDifferenceStatus {
  if (differenceValue.startsWith("-")) {
    return "under";
  }
  if (/^0+(\.0+)?$/.test(differenceValue)) {
    return "exact";
  }
  return "over";
}
