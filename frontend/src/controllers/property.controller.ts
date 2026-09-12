// SPDX-License-Identifier: MIT

import { createProperty, deleteProperty, fetchProperties, updateProperty } from "../api/property.api";
import { getContentContainer } from "../views/layout.view";
import { confirmDangerousAction, renderEmptyState, renderLoading, showGlobalAlert } from "../views/shared.view";
import { renderPropertyList, renderPropertyPage, setPropertyFormMode, setPropertySubmitDisabled } from "../views/property.view";
import type { RentalProperty } from "../types/property.types";

/**
 * Trách nhiệm:
 * Điều phối trang "Cơ sở" — tải danh sách, xử lý submit thêm/sửa (một
 * form dùng chung, chuyển chế độ qua state module nội bộ
 * `editingPropertyId`).
 *
 * Bất biến quan trọng:
 * Xóa PHẢI được xác nhận (`confirmDangerousAction`) TRƯỚC khi gọi API —
 * không bao giờ xoá ngay từ một cú bấm nhầm. Khi backend trả 409
 * `PROPERTY_HAS_DEPENDENCIES` (cơ sở còn phòng), hiển thị message THÂN
 * THIỆN riêng (`propertyDeleteErrorMessage`) thay vì message thô của
 * backend — xem docs/MANAGEMENT_API.md mục "Xác nhận trước khi xoá".
 *
 * Không chịu trách nhiệm: tự validate business rule (trim/empty-to-null cho address)
 * — backend (`PropertyManagementService`) là nơi xác thực có thẩm
 * quyền; frontend chỉ chặn trường hợp rõ ràng nhất (tên rỗng) để tránh
 * một round-trip API vô ích.
 */
let editingPropertyId: string | null = null;
let cachedProperties: RentalProperty[] = [];

export async function renderPropertyManagementPage(): Promise<void> {
  editingPropertyId = null;
  const container = getContentContainer();
  renderPropertyPage(container);
  wirePropertyForm();
  await loadPropertyList();
}

async function loadPropertyList(): Promise<void> {
  const region = document.querySelector<HTMLElement>("#property-list-region");
  if (!region) return;
  renderLoading(region);

  const result = await fetchProperties();
  if (!result.success) {
    showGlobalAlert("danger", result.error.message);
    renderEmptyState(region, "Không thể tải danh sách cơ sở.");
    return;
  }

  cachedProperties = result.data;
  renderPropertyList(region, cachedProperties);
  wirePropertyEditButtons();
}

function wirePropertyEditButtons(): void {
  document.querySelectorAll<HTMLButtonElement>(".app-edit-property-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const property = cachedProperties.find((p) => p.id === btn.dataset.id);
      if (!property) return;
      editingPropertyId = property.id;
      setPropertyFormMode("edit", property);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  document.querySelectorAll<HTMLButtonElement>(".app-delete-property-btn").forEach((btn) => {
    btn.addEventListener("click", () => void handleDeleteProperty(btn));
  });
}

/** Message THÂN THIỆN cho `PROPERTY_HAS_DEPENDENCIES`; mọi mã lỗi khác hiển thị nguyên văn message backend. */
function propertyDeleteErrorMessage(error: { code: string; message: string }): string {
  if (error.code === "PROPERTY_HAS_DEPENDENCIES") {
    return "Không thể xóa cơ sở vì cơ sở đang có phòng liên quan.";
  }
  return error.message;
}

async function handleDeleteProperty(btn: HTMLButtonElement): Promise<void> {
  const id = btn.dataset.id;
  const name = btn.dataset.name ?? "";
  if (!id) return;

  if (!confirmDangerousAction(`Bạn có chắc muốn xóa cơ sở "${name}"?`)) return;

  const result = await deleteProperty(id);
  if (!result.success) {
    showGlobalAlert("danger", propertyDeleteErrorMessage(result.error));
    return;
  }

  showGlobalAlert("success", "Đã xóa cơ sở.");
  if (editingPropertyId === id) {
    editingPropertyId = null;
    setPropertyFormMode("create");
  }
  await loadPropertyList();
}

function wirePropertyForm(): void {
  const form = document.querySelector<HTMLFormElement>("#property-form");
  const cancelBtn = document.querySelector<HTMLButtonElement>("#property-cancel-btn");

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitPropertyForm();
  });

  cancelBtn?.addEventListener("click", () => {
    editingPropertyId = null;
    setPropertyFormMode("create");
  });
}

async function submitPropertyForm(): Promise<void> {
  const nameInput = document.querySelector<HTMLInputElement>("#property-name");
  const addressInput = document.querySelector<HTMLInputElement>("#property-address");
  if (!nameInput || !addressInput) return;

  const name = nameInput.value.trim();
  if (name.length === 0) {
    showGlobalAlert("warning", "Vui lòng nhập tên cơ sở.");
    return;
  }
  const trimmedAddress = addressInput.value.trim();
  const address = trimmedAddress.length === 0 ? null : trimmedAddress;

  setPropertySubmitDisabled(true);
  try {
    const result = editingPropertyId
      ? await updateProperty(editingPropertyId, { name, address })
      : await createProperty({ name, address });

    if (!result.success) {
      showGlobalAlert("danger", result.error.message);
      return;
    }

    showGlobalAlert("success", editingPropertyId ? "Đã cập nhật cơ sở." : "Đã thêm cơ sở.");
    editingPropertyId = null;
    setPropertyFormMode("create");
    await loadPropertyList();
  } finally {
    setPropertySubmitDisabled(false);
  }
}
