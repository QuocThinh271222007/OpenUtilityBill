// SPDX-License-Identifier: MIT

import { escapeHtml } from "../utils/format";
import { renderEmptyState } from "./shared.view";
import type { Room } from "../types/room.types";

/**
 * Trách nhiệm:
 * Render trang "Phòng" — form thêm/sửa (propertyId chỉ chọn được khi
 * TẠO MỚI, bị khoá khi sửa — xem `setRoomFormMode`), bộ lọc theo cơ sở,
 * và bảng danh sách.
 *
 * Không chịu trách nhiệm: gọi API — Controller lo việc đó.
 */
export function renderRoomPage(container: HTMLElement): void {
  container.innerHTML = `
    <div class="card mb-4">
      <div class="card-header" id="room-form-title">Thêm phòng</div>
      <div class="card-body">
        <form id="room-form" novalidate>
          <input type="hidden" id="room-form-id" value="" />
          <div class="mb-3">
            <label for="room-property-select" class="form-label">Cơ sở</label>
            <select class="form-select" id="room-property-select" required></select>
          </div>
          <div class="mb-3">
            <label for="room-name" class="form-label">Tên phòng</label>
            <input type="text" class="form-control" id="room-name" required />
          </div>
          <div class="mb-3">
            <label for="room-tenant-count" class="form-label">Số người hiện tại</label>
            <input type="number" min="0" step="1" class="form-control" id="room-tenant-count" required />
            <div class="form-text">Hoá đơn cũ giữ nguyên số người đã dùng khi tính.</div>
          </div>
          <div class="d-flex gap-2">
            <button type="submit" class="btn btn-primary" id="room-submit-btn">Lưu</button>
            <button type="button" class="btn btn-outline-secondary d-none" id="room-cancel-btn">Hủy sửa</button>
          </div>
        </form>
      </div>
    </div>
    <div class="card">
      <div class="card-header d-flex flex-wrap gap-2 align-items-center justify-content-between">
        <span>Danh sách phòng</span>
        <div class="app-inline-filter">
          <label for="room-filter-select" class="form-label visually-hidden">Lọc theo cơ sở</label>
          <select class="form-select form-select-sm" id="room-filter-select">
            <option value="">Tất cả cơ sở</option>
          </select>
        </div>
      </div>
      <div class="card-body">
        <div id="room-list-region"></div>
      </div>
    </div>
  `;
}

export function renderRoomList(regionEl: HTMLElement, rooms: Room[], propertyNameById: Map<string, string>): void {
  if (rooms.length === 0) {
    renderEmptyState(regionEl, "Chưa có phòng nào.");
    return;
  }

  const rows = rooms
    .map(
      (room) => `
        <tr>
          <td>${escapeHtml(room.name)}</td>
          <td>${escapeHtml(propertyNameById.get(room.propertyId) ?? room.propertyId)}</td>
          <td>${room.tenantCount}</td>
          <td>
            <button type="button" class="btn btn-sm btn-outline-primary app-edit-room-btn" data-id="${escapeHtml(room.id)}">
              Sửa
            </button>
          </td>
        </tr>
      `
    )
    .join("");

  regionEl.innerHTML = `
    <div class="table-responsive">
      <table class="table table-hover align-middle">
        <thead><tr><th>Phòng</th><th>Cơ sở</th><th>Số người hiện tại</th><th>Thao tác</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

export function setRoomFormMode(mode: "create" | "edit", room?: Room): void {
  const title = document.querySelector<HTMLElement>("#room-form-title");
  const idInput = document.querySelector<HTMLInputElement>("#room-form-id");
  const propertySelect = document.querySelector<HTMLSelectElement>("#room-property-select");
  const nameInput = document.querySelector<HTMLInputElement>("#room-name");
  const tenantCountInput = document.querySelector<HTMLInputElement>("#room-tenant-count");
  const cancelBtn = document.querySelector<HTMLButtonElement>("#room-cancel-btn");
  if (!title || !idInput || !propertySelect || !nameInput || !tenantCountInput || !cancelBtn) return;

  if (mode === "edit" && room) {
    title.textContent = `Sửa phòng: ${room.name}`;
    idInput.value = room.id;
    propertySelect.value = room.propertyId;
    propertySelect.disabled = true;
    nameInput.value = room.name;
    tenantCountInput.value = String(room.tenantCount);
    cancelBtn.classList.remove("d-none");
  } else {
    title.textContent = "Thêm phòng";
    idInput.value = "";
    propertySelect.disabled = false;
    propertySelect.value = "";
    nameInput.value = "";
    tenantCountInput.value = "";
    cancelBtn.classList.add("d-none");
  }
}

export function setRoomSubmitDisabled(disabled: boolean): void {
  const btn = document.querySelector<HTMLButtonElement>("#room-submit-btn");
  if (btn) btn.disabled = disabled;
}
