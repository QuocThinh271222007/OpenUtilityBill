// SPDX-License-Identifier: MIT

import { escapeHtml } from "../utils/format";

/**
 * Trách nhiệm:
 * Các hàm render DÙNG CHUNG bởi mọi screen: vùng cảnh báo toàn cục
 * (`#app-alert-region`, do `views/layout.view.ts` tạo), trạng thái
 * "đang tải", trạng thái rỗng, và render `<option>` cho các `<select>`
 * dùng lặp lại (cơ sở, phòng) ở nhiều screen (room, meter-reading,
 * invoice).
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

export function renderLoading(container: HTMLElement, label = "Đang tải..."): void {
  container.innerHTML = `<p class="text-muted app-loading">${escapeHtml(label)}</p>`;
}

export function renderEmptyState(container: HTMLElement, message: string): void {
  container.innerHTML = `<p class="text-muted app-empty-state">${escapeHtml(message)}</p>`;
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
