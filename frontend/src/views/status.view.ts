// SPDX-License-Identifier: MIT

/**
 * Trách nhiệm:
 * Cập nhật vùng #backend-status trên DOM (nay nằm trong sidebar, xem
 * views/layout.view.ts) theo trạng thái backend đã được Controller xác
 * định.
 *
 * Không chịu trách nhiệm:
 * - gọi API
 * - tự quyết định trạng thái là gì (chỉ nhận state đã xác định sẵn)
 * - làm ứng dụng khởi động thất bại chỉ vì health check lỗi — chỉ cập
 *   nhật một badge nhỏ, không chặn điều hướng/render các trang khác.
 *
 * Lý do:
 * View chỉ render dữ liệu ra HTML; mọi quyết định logic nằm ở
 * Controller, để View có thể đổi cách hiển thị mà không ảnh hưởng
 * luồng dữ liệu.
 */
export function renderBackendOnline(): void {
  const el = document.querySelector<HTMLElement>("#backend-status");
  if (!el) return;
  el.innerHTML = '<span class="badge text-bg-success">Backend hoạt động</span>';
}

export function renderBackendOffline(message: string): void {
  const el = document.querySelector<HTMLElement>("#backend-status");
  if (!el) return;
  el.innerHTML = '<span class="badge text-bg-danger">Không kết nối được backend</span>';
  const detail = document.createElement("div");
  detail.className = "app-backend-status-detail text-muted";
  detail.textContent = message;
  el.appendChild(detail);
}
