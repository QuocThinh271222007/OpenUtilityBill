// SPDX-License-Identifier: MIT

import { formatDateInputMask, formatMonthInputMask } from "./format";

/**
 * Trách nhiệm:
 * Wiring DOM (KHÔNG thuần) cho ô nhập ngày đầy đủ (DD/MM/YYYY) và kỳ
 * billing (MM/YYYY) — tự chèn "/" khi người dùng gõ số, để bàn phím số
 * trên di động (`inputmode="numeric"`) không cần người dùng tự tìm
 * phím "/".
 *
 * Bất biến quan trọng:
 * Khác với ô tiền (`utils/money-input.ts`), mask ngày/tháng KHÔNG cần
 * lưu state riêng — `formatDateInputMask`/`formatMonthInputMask` luôn
 * BỎ HẾT ký tự không phải chữ số rồi tính lại "/" từ ĐẦU dựa trên SỐ
 * LƯỢNG chữ số, nên gọi lại an toàn trên MỌI giá trị DOM trung gian
 * (không có gì mơ hồ như dấu thập phân của tiền — không có "một dấu
 * '/' cũ có thể lệch vị trí"). Vì vậy một handler `input` DUY NHẤT xử
 * lý đúng cả gõ tay LẪN dán (không cần `beforeinput`/`paste` riêng như
 * tiền): dán "10/05/2025" hay "10052025" đều bị bỏ hết ký tự không
 * phải số trước khi tính lại, cho cùng kết quả.
 *
 * Con trỏ luôn đặt về CUỐI ô sau mỗi lần định dạng lại — không cố giữ
 * đúng vị trí con trỏ cho việc sửa ở GIỮA chuỗi.
 *
 * Không chịu trách nhiệm:
 * - validate lịch/tháng hợp lệ — `displayDateToIsoDate`/
 *   `monthDisplayToBillingPeriod` vẫn là nơi xác thực hình dạng/lịch
 *   có thẩm quyền trước khi gửi API.
 */
export function wireDateInputMask(input: HTMLInputElement): void {
  input.addEventListener("input", () => {
    const display = formatDateInputMask(input.value);
    input.value = display;
    input.setSelectionRange(display.length, display.length);
  });
}

export function wireMonthInputMask(input: HTMLInputElement): void {
  input.addEventListener("input", () => {
    const display = formatMonthInputMask(input.value);
    input.value = display;
    input.setSelectionRange(display.length, display.length);
  });
}
