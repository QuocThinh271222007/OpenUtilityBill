// SPDX-License-Identifier: MIT

import { fetchProperties } from "../api/property.api";
import { createRoom, deleteRoom, fetchRooms, updateRoom } from "../api/room.api";
import { getContentContainer } from "../views/layout.view";
import { confirmDangerousAction, renderEmptyState, renderLoading, renderSelectOptions, showGlobalAlert } from "../views/shared.view";
import { renderRoomList, renderRoomPage, setRoomFormMode, setRoomSubmitDisabled } from "../views/room.view";
import type { RentalProperty } from "../types/property.types";
import type { Room } from "../types/room.types";

/**
 * Trách nhiệm:
 * Điều phối trang "Phòng" — tải danh sách cơ sở (cho select trong form
 * VÀ bộ lọc danh sách), tải danh sách phòng (tôn trọng bộ lọc cơ sở
 * hiện tại), xử lý submit thêm/sửa.
 *
 * Bất biến quan trọng:
 * `propertyId` KHÔNG BAO GIỜ được gửi khi sửa (`updateRoom` chỉ nhận
 * `name`/`tenantCount`) — khớp `UpdateRoomBody` (propertyId immutable
 * trên PATCH, xem docs/MANAGEMENT_API.md).
 *
 * Xóa PHẢI được xác nhận (`confirmDangerousAction`) TRƯỚC khi gọi API.
 * Khi backend trả 409 `ROOM_HAS_DEPENDENCIES` (phòng còn chỉ số công
 * tơ/hóa đơn), hiển thị message THÂN THIỆN riêng
 * (`roomDeleteErrorMessage`) — cùng cách tiếp cận với
 * `property.controller.ts`.
 *
 * Không chịu trách nhiệm: implement CSDL/SQL — chỉ gọi API và render.
 */
let editingRoomId: string | null = null;
let cachedProperties: RentalProperty[] = [];
let cachedRooms: Room[] = [];
let propertyNameById = new Map<string, string>();

export async function renderRoomManagementPage(): Promise<void> {
  editingRoomId = null;
  const container = getContentContainer();
  renderRoomPage(container);
  wireRoomForm();
  wireFilterSelect();

  const propertiesResult = await fetchProperties();
  if (!propertiesResult.success) {
    showGlobalAlert("danger", propertiesResult.error.message);
    cachedProperties = [];
  } else {
    cachedProperties = propertiesResult.data;
  }
  propertyNameById = new Map(cachedProperties.map((p) => [p.id, p.name]));

  const propertySelect = document.querySelector<HTMLSelectElement>("#room-property-select");
  const filterSelect = document.querySelector<HTMLSelectElement>("#room-filter-select");
  if (propertySelect) renderSelectOptions(propertySelect, propertyOptionItems(), "-- Chọn cơ sở --");
  if (filterSelect) renderSelectOptions(filterSelect, propertyOptionItems(), "Tất cả cơ sở");

  await loadRoomList(undefined);
}

function propertyOptionItems(): Array<{ id: string; label: string }> {
  return cachedProperties.map((p) => ({ id: p.id, label: p.name }));
}

async function loadRoomList(propertyIdFilter: string | undefined): Promise<void> {
  const region = document.querySelector<HTMLElement>("#room-list-region");
  if (!region) return;
  renderLoading(region);

  const result = await fetchRooms(propertyIdFilter);
  if (!result.success) {
    showGlobalAlert("danger", result.error.message);
    renderEmptyState(region, "Không thể tải danh sách phòng.");
    return;
  }

  cachedRooms = result.data;
  renderRoomList(region, cachedRooms, propertyNameById, propertyIdFilter !== undefined);
  wireRoomEditButtons();
}

function wireFilterSelect(): void {
  const filterSelect = document.querySelector<HTMLSelectElement>("#room-filter-select");
  filterSelect?.addEventListener("change", () => {
    void loadRoomList(filterSelect.value || undefined);
  });
}

function wireRoomEditButtons(): void {
  document.querySelectorAll<HTMLButtonElement>(".app-edit-room-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const room = cachedRooms.find((r) => r.id === btn.dataset.id);
      if (!room) return;
      editingRoomId = room.id;
      setRoomFormMode("edit", room);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  document.querySelectorAll<HTMLButtonElement>(".app-delete-room-btn").forEach((btn) => {
    btn.addEventListener("click", () => void handleDeleteRoom(btn));
  });
}

/** Message THÂN THIỆN cho `ROOM_HAS_DEPENDENCIES`; mọi mã lỗi khác hiển thị nguyên văn message backend. */
function roomDeleteErrorMessage(error: { code: string; message: string }): string {
  if (error.code === "ROOM_HAS_DEPENDENCIES") {
    return "Không thể xóa phòng vì phòng đang có chỉ số công tơ hoặc hóa đơn liên quan.";
  }
  return error.message;
}

async function handleDeleteRoom(btn: HTMLButtonElement): Promise<void> {
  const id = btn.dataset.id;
  const name = btn.dataset.name ?? "";
  if (!id) return;

  if (!confirmDangerousAction(`Bạn có chắc muốn xóa phòng ${name}?`)) return;

  const result = await deleteRoom(id);
  if (!result.success) {
    showGlobalAlert("danger", roomDeleteErrorMessage(result.error));
    return;
  }

  showGlobalAlert("success", "Đã xóa phòng.");
  if (editingRoomId === id) {
    editingRoomId = null;
    setRoomFormMode("create");
  }
  const filterSelect = document.querySelector<HTMLSelectElement>("#room-filter-select");
  await loadRoomList(filterSelect?.value || undefined);
}

function wireRoomForm(): void {
  const form = document.querySelector<HTMLFormElement>("#room-form");
  const cancelBtn = document.querySelector<HTMLButtonElement>("#room-cancel-btn");

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitRoomForm();
  });

  cancelBtn?.addEventListener("click", () => {
    editingRoomId = null;
    setRoomFormMode("create");
  });
}

async function submitRoomForm(): Promise<void> {
  const propertySelect = document.querySelector<HTMLSelectElement>("#room-property-select");
  const nameInput = document.querySelector<HTMLInputElement>("#room-name");
  const tenantCountInput = document.querySelector<HTMLInputElement>("#room-tenant-count");
  if (!propertySelect || !nameInput || !tenantCountInput) return;

  const name = nameInput.value.trim();
  if (name.length === 0) {
    showGlobalAlert("warning", "Vui lòng nhập tên phòng.");
    return;
  }

  // tenantCount là số nguyên đếm được (backend cột INTEGER, không phải
  // NUMERIC tài chính) — an toàn để dùng valueAsNumber sau khi kiểm tra
  // là số nguyên hợp lệ (xem docs/FRONTEND.md mục "Integer vs.
  // financial decimal fields").
  const tenantCount = tenantCountInput.valueAsNumber;
  if (!Number.isInteger(tenantCount) || tenantCount < 0) {
    showGlobalAlert("warning", "Số người hiện tại phải là số nguyên không âm.");
    return;
  }

  setRoomSubmitDisabled(true);
  try {
    let result;
    if (editingRoomId) {
      result = await updateRoom(editingRoomId, { name, tenantCount });
    } else {
      const propertyId = propertySelect.value;
      if (!propertyId) {
        showGlobalAlert("warning", "Vui lòng chọn cơ sở.");
        return;
      }
      result = await createRoom({ propertyId, name, tenantCount });
    }

    if (!result.success) {
      showGlobalAlert("danger", result.error.message);
      return;
    }

    showGlobalAlert("success", editingRoomId ? "Đã cập nhật phòng." : "Đã thêm phòng.");
    editingRoomId = null;
    setRoomFormMode("create");
    const filterSelect = document.querySelector<HTMLSelectElement>("#room-filter-select");
    await loadRoomList(filterSelect?.value || undefined);
  } finally {
    setRoomSubmitDisabled(false);
  }
}
