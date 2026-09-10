// SPDX-License-Identifier: MIT

/**
 * Responsibility:
 * Cập nhật vùng #backend-status trên DOM theo trạng thái backend đã
 * được Controller xác định.
 *
 * Does NOT:
 * - gọi API
 * - tự quyết định trạng thái là gì (chỉ nhận state đã xác định sẵn)
 *
 * Reason:
 * View chỉ render dữ liệu ra HTML; mọi quyết định logic nằm ở
 * Controller, để View có thể đổi cách hiển thị mà không ảnh hưởng
 * luồng dữ liệu.
 */
export function renderBackendOnline(): void {
  const el = document.querySelector<HTMLElement>("#backend-status");
  if (!el) return;
  el.innerHTML = '<span class="badge text-bg-success">Backend: OK</span>';
}

export function renderBackendOffline(message: string): void {
  const el = document.querySelector<HTMLElement>("#backend-status");
  if (!el) return;
  el.innerHTML =
    '<span class="badge text-bg-danger">Backend: lỗi</span> ' +
    `<small class="text-muted">${message}</small>`;
}
