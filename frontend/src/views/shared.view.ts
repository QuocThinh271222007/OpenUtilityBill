// SPDX-License-Identifier: MIT

import { escapeHtml } from "../utils/format";

/**
 * Trách nhiệm:
 * Các hàm render DÙNG CHUNG bởi mọi screen: vùng cảnh báo toàn cục
 * (`#app-alert-region`, do `views/layout.view.ts` tạo), trạng thái
 * "đang tải", trạng thái rỗng (có thể kèm một hành động tiếp theo),
 * trạng thái "đang xử lý" của nút submit, đoạn mô tả ngắn dưới tiêu đề
 * trang, và render `<option>` cho các `<select>` dùng lặp lại (cơ sở,
 * phòng) ở nhiều screen (room, meter-reading, invoice).
 *
 * Không chịu trách nhiệm:
 * - gọi API hay quyết định NỘI DUNG cảnh báo — Controller quyết định
 *   khi nào gọi, với message gì; file này chỉ render.
 */
export type AlertType = "success" | "danger" | "warning";

/**
 * Hiển thị một cảnh báo Bootstrap trong vùng toàn cục. Nội dung message
 * được gán qua `textContent` (KHÔNG qua `innerHTML`) — an toàn với mọi
 * message đến từ backend hay do người dùng tạo ra gián tiếp, không cần
 * escape thủ công (xem docs/FRONTEND.md mục "Escape HTML").
 *
 * Nút đóng được wire bằng `addEventListener` thuần DOM — KHÔNG dùng cơ
 * chế `data-bs-dismiss` của Bootstrap JS (dự án không nạp Bootstrap JS,
 * xem docs/FRONTEND.md mục "Công nghệ (đã khoá)").
 */
export function showGlobalAlert(type: AlertType, message: string): void {
  const region = document.querySelector<HTMLElement>("#app-alert-region");
  if (!region) return;

  const alertEl = document.createElement("div");
  alertEl.className = `alert alert-${type} d-flex justify-content-between align-items-start gap-3`;
  alertEl.setAttribute("role", "alert");

  const textEl = document.createElement("span");
  textEl.textContent = message;
  alertEl.appendChild(textEl);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "btn-close";
  closeBtn.setAttribute("aria-label", "Đóng thông báo");
  closeBtn.addEventListener("click", () => alertEl.remove());
  alertEl.appendChild(closeBtn);

  region.appendChild(alertEl);

  if (type === "success") {
    setTimeout(() => alertEl.remove(), 4000);
  }
}

export function clearGlobalAlerts(): void {
  const region = document.querySelector<HTMLElement>("#app-alert-region");
  if (region) region.textContent = "";
}

export function renderLoading(container: HTMLElement, label = "Đang tải dữ liệu…"): void {
  container.innerHTML = `<p class="text-muted app-loading">${escapeHtml(label)}</p>`;
}

/**
 * `actionHtml` là HTML TIN CẬY do chính view gọi truyền vào (ví dụ một
 * `<a class="btn btn-primary" href="#/properties">Tạo cơ sở</a>`), KHÔNG
 * BAO GIỜ nội suy dữ liệu người dùng/backend trực tiếp vào đó — nếu cần
 * hiển thị dữ liệu động bên trong, phải tự `escapeHtml` trước ở nơi gọi.
 * `message` (văn bản chính) vẫn luôn được escape ở đây.
 */
export function renderEmptyState(container: HTMLElement, message: string, actionHtml?: string): void {
  container.innerHTML = `
    <div class="app-empty-state">
      <p class="text-muted mb-0">${escapeHtml(message)}</p>
      ${actionHtml ? `<div class="app-empty-state-action">${actionHtml}</div>` : ""}
    </div>
  `;
}

/**
 * Chuyển một nút submit vào/ra trạng thái "đang xử lý" — đổi nhãn tạm
 * thời (lưu nhãn gốc vào `dataset.originalLabel` lần đầu) và bật/tắt
 * `disabled`. Dùng chung cho mọi form Lưu/Tạo để người dùng thấy rõ yêu
 * cầu đang chạy, và để ngăn double-submit (nút đã `disabled` trong lúc
 * xử lý) — không đổi hành vi transaction/idempotency của backend, chỉ
 * là trạng thái hiển thị phía UI.
 */
export function setButtonBusyState(button: HTMLButtonElement, busy: boolean, busyLabel = "Đang xử lý…"): void {
  if (busy) {
    if (button.dataset.originalLabel === undefined) {
      button.dataset.originalLabel = button.textContent ?? "";
    }
    button.disabled = true;
    button.textContent = busyLabel;
  } else {
    button.disabled = false;
    if (button.dataset.originalLabel !== undefined) {
      button.textContent = button.dataset.originalLabel;
    }
  }
}

/** Đoạn mô tả ngắn ngay dưới tiêu đề trang — dùng ở đầu mỗi `render*Page`. Chỉ MỘT dòng, không phải đoạn văn hướng dẫn dài. */
export function pageIntroHtml(description: string): string {
  return `<p class="app-page-description">${escapeHtml(description)}</p>`;
}

/**
 * Render `<option>` cho một `<select>` dùng chung (cơ sở, phòng, ...) —
 * `items` là cặp (id, label hiển thị) đã được Controller chuẩn bị sẵn.
 * `placeholder` là lựa chọn đầu tiên, giá trị rỗng (chưa chọn gì).
 */
export function renderSelectOptions(
  selectEl: HTMLSelectElement,
  items: Array<{ id: string; label: string }>,
  placeholder: string
): void {
  const optionsHtml = items.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`).join("");
  selectEl.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>${optionsHtml}`;
}
