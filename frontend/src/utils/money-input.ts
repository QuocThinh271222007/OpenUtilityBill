// SPDX-License-Identifier: MIT

import { formatMoneyInputDisplay } from "./format";

/**
 * Trách nhiệm:
 * Wiring DOM (KHÔNG thuần — khác `utils/format.ts` cố ý) cho một ô
 * `<input>` tiền: định dạng lại hiển thị (nhóm hàng nghìn ".", thập
 * phân ",") NGAY khi người dùng gõ hoặc dán, mà không đi qua
 * `Number`/`parseFloat`.
 *
 * Bất biến quan trọng:
 * Sự kiện gõ bình thường (`input`, không phải paste) LUÔN bỏ hết dấu
 * "." trong giá trị DOM hiện tại TRƯỚC KHI gọi `formatMoneyInputDisplay`
 * — nếu không, một dấu "." do CHÍNH lượt định dạng TRƯỚC đó chèn (ví
 * dụ "4.000") sẽ trở nên lệch vị trí sau khi gõ thêm chữ số ("4.0000"),
 * khiến hàm định dạng hiểu sai đó là dấu thập phân. Bỏ hết dấu "." rồi
 * mới định dạng lại từ đầu tránh hoàn toàn vấn đề này, và là cách duy
 * nhất để "gõ số ở cuối luôn hoạt động đúng" mà không cần theo dõi vị
 * trí con trỏ/loại phím đã gõ.
 *
 * Sự kiện dán (`paste`) được xử lý riêng, dùng NGUYÊN VĂN nội dung
 * clipboard (không bỏ dấu "." trước) — cho phép dán "40.000" (giữ
 * nguyên, vì `formatMoneyInputDisplay` tự nhận ra hình dạng nhóm hàng
 * nghìn) hoặc dán "40000.50"/"40.000,50" đều cho kết quả đúng.
 *
 * Con trỏ luôn được đặt về CUỐI ô sau mỗi lần định dạng lại — một lựa
 * chọn đơn giản, có chủ đích, đủ cho việc gõ thêm ở cuối/Backspace/xoá
 * trắng/dán hoạt động tự nhiên; KHÔNG cố giữ đúng vị trí con trỏ cho
 * việc sửa ở GIỮA một số đã gõ.
 *
 * Không chịu trách nhiệm:
 * - đọc/parse giá trị lúc submit — nơi gọi (Controller) dùng
 *   `moneyDisplayToCanonical` riêng cho việc đó.
 */
export function wireMoneyInput(input: HTMLInputElement): void {
  input.addEventListener("input", () => {
    const withoutThousandsDots = input.value.replace(/\./g, "");
    const display = formatMoneyInputDisplay(withoutThousandsDots);
    input.value = display;
    input.setSelectionRange(display.length, display.length);
  });

  input.addEventListener("paste", (event) => {
    const pastedText = event.clipboardData?.getData("text") ?? "";
    if (pastedText.length === 0) return;
    event.preventDefault();
    const display = formatMoneyInputDisplay(pastedText);
    input.value = display;
    input.setSelectionRange(display.length, display.length);
  });
}

/** Nạp sẵn một ô tiền từ giá trị canonical của backend (ví dụ khi mở form sửa) — dùng `formatMoneyInputDisplay` trực tiếp, không qua bước bỏ dấu "." (giá trị canonical LUÔN dùng "." làm thập phân, không có nhóm hàng nghìn). */
export function setMoneyInputFromCanonical(input: HTMLInputElement, canonicalValue: string): void {
  input.value = canonicalValue.length === 0 ? "" : formatMoneyInputDisplay(canonicalValue);
}
