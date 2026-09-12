// SPDX-License-Identifier: MIT

import { formatMoneyParts, parseMoneyInputParts } from "./format";
import type { MoneyInputParts } from "./format";

/**
 * Trách nhiệm:
 * Wiring DOM (KHÔNG thuần — khác `utils/format.ts` cố ý) cho một ô
 * `<input>` tiền: định dạng lại hiển thị (nhóm hàng nghìn ".", thập
 * phân ",") NGAY khi người dùng gõ hoặc dán, mà không đi qua
 * `Number`/`parseFloat`.
 *
 * Bất biến quan trọng:
 * Mỗi ô tiền có một `MoneyInputParts` LƯU RIÊNG (WeakMap, khoá theo
 * chính element) — nguồn sự thật cho "người dùng đã gõ gì", KHÔNG phải
 * chuỗi hiển thị hiện tại trong DOM. Điều này giải quyết vấn đề: một
 * dấu "." do CHÍNH lượt định dạng TRƯỚC đó chèn (ví dụ gõ "40000" ->
 * hiển thị "40.000") không thể phân biệt được với một dấu "." NGƯỜI
 * DÙNG gõ thêm với ý định thập phân (ví dụ gõ tiếp "." rồi "5" muốn ra
 * "40.000,5") nếu chỉ nhìn vào chuỗi DOM đã trộn ký hiệu — re-parse
 * chuỗi đó mỗi lần gõ sẽ đoán sai. Lưu `MoneyInputParts` riêng và cập
 * nhật TRỰC TIẾP theo từng phím (`beforeinput`) tránh hoàn toàn vấn đề
 * này: một dấu `,`/`.` gõ thêm luôn được hiểu là "bắt đầu phần lẻ",
 * không phụ thuộc vào việc nhóm hàng nghìn đã hiển thị trước đó dài
 * bao nhiêu chữ số.
 *
 * `beforeinput` được dùng (không phải `input`) để có `inputType`/`data`
 * đáng tin cậy TRƯỚC khi DOM đổi, và để `preventDefault()` cho các
 * trường hợp xử lý CHÍNH XÁC (gõ thêm ở cuối, Backspace ở cuối, chọn
 * toàn bộ rồi gõ/xoá) — nơi bàn giao hoàn toàn việc render cho
 * `formatMoneyParts`, không để trình duyệt tự sửa DOM. Các trường hợp
 * CHỈNH SỬA Ở GIỮA chuỗi (không chọn toàn bộ, con trỏ không ở cuối)
 * KHÔNG được xử lý chính xác theo từng phím — cố ý đơn giản hoá: để
 * trình duyệt tự sửa DOM, rồi `input` handler (dự phòng) diễn giải lại
 * TOÀN BỘ chuỗi kết quả bằng `parseMoneyInputParts` (cùng quy tắc dùng
 * cho dán) và đồng bộ lại state. Đây là lựa chọn CÓ CHỦ ĐÍCH: giữ đúng
 * con trỏ cho MỌI kiểu sửa giữa chuỗi cần một cơ chế mask đầy đủ,
 * không cân xứng với phạm vi ô nhập liệu này — gõ ở cuối, Backspace,
 * chọn tất cả, và dán (các trường hợp bắt buộc) đều chính xác.
 *
 * Không chịu trách nhiệm:
 * - đọc/parse giá trị lúc submit — nơi gọi (Controller) dùng
 *   `moneyDisplayToCanonical` riêng cho việc đó.
 */
const stateByInput = new WeakMap<HTMLInputElement, MoneyInputParts>();

function emptyParts(): MoneyInputParts {
  return { integerDigits: "", fractionalDigits: "", hasDecimal: false };
}

function render(input: HTMLInputElement, parts: MoneyInputParts): void {
  stateByInput.set(input, parts);
  const display = formatMoneyParts(parts);
  input.value = display;
  input.setSelectionRange(display.length, display.length);
}

/** Áp dụng MỘT ký tự người dùng gõ (chữ số, hoặc dấu thập phân "," / ".") vào `MoneyInputParts` hiện có. Ký tự khác bị bỏ qua. */
function applyTypedChar(parts: MoneyInputParts, char: string): MoneyInputParts {
  if (/^\d$/.test(char)) {
    if (parts.hasDecimal) {
      if (parts.fractionalDigits.length >= 2) return parts;
      return { ...parts, fractionalDigits: parts.fractionalDigits + char };
    }
    return { ...parts, integerDigits: parts.integerDigits + char };
  }
  if (char === "," || char === ".") {
    if (parts.hasDecimal) return parts;
    return { ...parts, hasDecimal: true };
  }
  return parts;
}

/** Backspace — xoá chữ số/dấu thập phân CUỐI CÙNG theo đúng thứ tự người dùng sẽ mong đợi khi xoá từ cuối chuỗi hiển thị. */
function applyBackspace(parts: MoneyInputParts): MoneyInputParts {
  if (parts.hasDecimal) {
    if (parts.fractionalDigits.length > 0) {
      return { ...parts, fractionalDigits: parts.fractionalDigits.slice(0, -1) };
    }
    return { ...parts, hasDecimal: false };
  }
  if (parts.integerDigits.length > 0) {
    return { ...parts, integerDigits: parts.integerDigits.slice(0, -1) };
  }
  return parts;
}

const INSERT_INPUT_TYPES = new Set(["insertText", "insertFromDrop", "insertReplacementText", "insertCompositionText"]);
const DELETE_INPUT_TYPES = new Set(["deleteContentBackward", "deleteContentForward", "deleteByCut"]);

export function wireMoneyInput(input: HTMLInputElement): void {
  stateByInput.set(input, parseMoneyInputParts(input.value));

  input.addEventListener("beforeinput", (event) => {
    const inputEvent = event as InputEvent;
    const currentLength = input.value.length;
    const selectionStart = input.selectionStart ?? currentLength;
    const selectionEnd = input.selectionEnd ?? currentLength;
    const isFullSelection = currentLength > 0 && selectionStart === 0 && selectionEnd === currentLength;
    const isCollapsedAtEnd = selectionStart === selectionEnd && selectionStart === currentLength;

    if (INSERT_INPUT_TYPES.has(inputEvent.inputType)) {
      if (!isFullSelection && !isCollapsedAtEnd) return; // để trình duyệt tự sửa, `input` handler dự phòng lo phần render
      let parts = isFullSelection ? emptyParts() : (stateByInput.get(input) ?? emptyParts());
      for (const char of inputEvent.data ?? "") {
        parts = applyTypedChar(parts, char);
      }
      event.preventDefault();
      render(input, parts);
      return;
    }

    if (DELETE_INPUT_TYPES.has(inputEvent.inputType)) {
      if (isFullSelection || (inputEvent.inputType === "deleteByCut" && selectionStart !== selectionEnd)) {
        event.preventDefault();
        render(input, emptyParts());
        return;
      }
      if (isCollapsedAtEnd && inputEvent.inputType === "deleteContentBackward") {
        event.preventDefault();
        render(input, applyBackspace(stateByInput.get(input) ?? emptyParts()));
        return;
      }
      // xoá ở giữa/xoá tới (delete-forward)/cut một phần: để trình duyệt tự sửa, xem `input` handler dự phòng.
    }
  });

  // Dự phòng CHỈ cho các trường hợp không preventDefault ở trên (sửa/xoá giữa chuỗi, undo/redo, IME, ...) —
  // `beforeinput` đã preventDefault thì trình duyệt không đổi DOM, nên `input` không bắn cho những lượt đó.
  input.addEventListener("input", () => {
    const parts = parseMoneyInputParts(input.value);
    render(input, parts);
  });

  input.addEventListener("paste", (event) => {
    const pastedText = event.clipboardData?.getData("text") ?? "";
    if (pastedText.length === 0) return;
    event.preventDefault();
    render(input, parseMoneyInputParts(pastedText));
  });
}

/** Nạp sẵn một ô tiền từ giá trị canonical của backend (ví dụ khi mở form sửa), đồng bộ cả state lưu trong `wireMoneyInput`. */
export function setMoneyInputFromCanonical(input: HTMLInputElement, canonicalValue: string): void {
  render(input, canonicalValue.length === 0 ? emptyParts() : parseMoneyInputParts(canonicalValue));
}
