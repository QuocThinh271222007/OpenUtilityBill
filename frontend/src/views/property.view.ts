// SPDX-License-Identifier: MIT

import { escapeHtml } from "../utils/format";
import { pageIntroHtml, renderEmptyState, setButtonBusyState } from "./shared.view";
import type { RentalProperty } from "../types/property.types";

/**
 * Trách nhiệm:
 * Render trang "Cơ sở" — form thêm/sửa (dùng chung MỘT form, chuyển
 * chế độ qua `setPropertyFormMode`) và bảng danh sách (kèm nút Xóa —
 * xem `property.controller.ts` cho luồng xác nhận trước khi xoá).
 *
 * Không chịu trách nhiệm: gọi API, quyết định khi nào submit/xoá — Controller lo việc đó.
 */
export function renderPropertyPage(container: HTMLElement): void {
  container.innerHTML = `
    ${pageIntroHtml("Quản lý danh sách cơ sở cho thuê.")}
    <div class="card mb-4 app-form-card">
      <div class="card-header" id="property-form-title">Thêm cơ sở</div>
      <div class="card-body">
        <form id="property-form" novalidate>
          <input type="hidden" id="property-form-id" value="" />
          <div class="mb-3">
            <label for="property-name" class="form-label">Tên cơ sở</label>
            <input type="text" class="form-control" id="property-name" required />
          </div>
          <div class="mb-3">
            <label for="property-address" class="form-label">Địa chỉ</label>
            <input type="text" class="form-control" id="property-address" />
          </div>
          <div class="d-flex gap-2">
            <button type="submit" class="btn btn-primary" id="property-submit-btn">Lưu</button>
            <button type="button" class="btn btn-outline-secondary d-none" id="property-cancel-btn">Hủy sửa</button>
          </div>
        </form>
      </div>
    </div>
    <div class="card">
      <div class="card-header">Danh sách cơ sở</div>
      <div class="card-body">
        <div id="property-list-region"></div>
      </div>
    </div>
  `;
}

export function renderPropertyList(regionEl: HTMLElement, properties: RentalProperty[]): void {
  if (properties.length === 0) {
    renderEmptyState(regionEl, "Chưa có cơ sở cho thuê.");
    return;
  }

  const rows = properties
    .map(
      (property) => `
        <tr>
          <td>${escapeHtml(property.id)}</td>
          <td>${escapeHtml(property.name)}</td>
          <td>${property.address !== null ? escapeHtml(property.address) : "—"}</td>
          <td>
            <div class="d-flex gap-2">
              <button type="button" class="btn btn-sm btn-outline-primary app-edit-property-btn" data-id="${escapeHtml(property.id)}">
                Sửa
              </button>
              <button
                type="button"
                class="btn btn-sm btn-outline-danger app-delete-property-btn"
                data-id="${escapeHtml(property.id)}"
                data-name="${escapeHtml(property.name)}"
              >
                Xóa
              </button>
            </div>
          </td>
        </tr>
      `
    )
    .join("");

  regionEl.innerHTML = `
    <div class="table-responsive">
      <table class="table table-hover align-middle app-table">
        <thead><tr><th>ID</th><th>Tên cơ sở</th><th>Địa chỉ</th><th>Thao tác</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

export function setPropertyFormMode(mode: "create" | "edit", property?: RentalProperty): void {
  const title = document.querySelector<HTMLElement>("#property-form-title");
  const idInput = document.querySelector<HTMLInputElement>("#property-form-id");
  const nameInput = document.querySelector<HTMLInputElement>("#property-name");
  const addressInput = document.querySelector<HTMLInputElement>("#property-address");
  const cancelBtn = document.querySelector<HTMLButtonElement>("#property-cancel-btn");
  if (!title || !idInput || !nameInput || !addressInput || !cancelBtn) return;

  if (mode === "edit" && property) {
    title.textContent = `Sửa cơ sở: ${property.name}`;
    idInput.value = property.id;
    nameInput.value = property.name;
    addressInput.value = property.address ?? "";
    cancelBtn.classList.remove("d-none");
  } else {
    title.textContent = "Thêm cơ sở";
    idInput.value = "";
    nameInput.value = "";
    addressInput.value = "";
    cancelBtn.classList.add("d-none");
  }
}

export function setPropertySubmitDisabled(disabled: boolean): void {
  const btn = document.querySelector<HTMLButtonElement>("#property-submit-btn");
  if (btn) setButtonBusyState(btn, disabled, "Đang lưu…");
}
