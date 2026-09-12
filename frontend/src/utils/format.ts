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

/** "YYYY-MM-DD" -> "DD/MM/YYYY", thuần cắt chuỗi (không dựng `Date`, tránh mọi vấn đề múi giờ). */
export function formatDateDisplay(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

/**
 * `<input type="month">` trả về "YYYY-MM" — ghép thêm "-01" để thành
 * `billingPeriod` ("YYYY-MM-DD") mà API cần. Thuần ghép chuỗi, KHÔNG
 * dùng `Date`/múi giờ local (xem docs/API.md mục "Hợp đồng ngày").
 */
export function monthInputToBillingPeriod(monthValue: string): string {
  return `${monthValue}-01`;
}

/** "YYYY-MM-DD" -> "YYYY-MM", để điền sẵn `<input type="month">` khi sửa. */
export function billingPeriodToMonthInput(billingPeriod: string): string {
  return billingPeriod.slice(0, 7);
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
