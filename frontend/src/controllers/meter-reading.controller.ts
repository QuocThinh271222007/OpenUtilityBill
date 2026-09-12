// SPDX-License-Identifier: MIT

import { fetchProperties } from "../api/property.api";
import { fetchRooms } from "../api/room.api";
import { createMeterReading, deleteMeterReading, fetchMeterReadings, updateMeterReading } from "../api/meter-reading.api";
import { getContentContainer } from "../views/layout.view";
import { confirmDangerousAction, renderEmptyState, renderLoading, renderSelectOptions, showGlobalAlert } from "../views/shared.view";
import {
  renderMeterReadingPage,
  renderReadingList,
  setReadingAddButtonEnabled,
  setReadingFormMode,
  setReadingFormVisible,
  setReadingSubmitDisabled,
  setReadingUnitSuffix,
} from "../views/meter-reading.view";
import { billingPeriodToMonthDisplay, monthDisplayToBillingPeriod } from "../utils/format";
import { utilityTypeDisplayLabel } from "../utils/labels";
import { wireMonthInputMask } from "../utils/masked-text-input";
import type { MeterReading, MeterReadingBody, UtilityType } from "../types/meter-reading.types";
import type { Room } from "../types/room.types";

/**
 * Trách nhiệm:
 * Điều phối trang "Ghi chỉ số" — luồng bắt buộc: chọn cơ sở -> chọn
 * phòng -> (tuỳ chọn) lọc theo kỳ -> xem lịch sử -> thêm/sửa MỘT chỉ số
 * điện HOẶC nước.
 *
 * Bất biến quan trọng:
 * Sau bước shape-check tối thiểu ở đây (không rỗng), tính hợp lệ THẬT
 * của tổ hợp previous/current/max (âm, vượt max, rollover, ...) hoàn
 * toàn do backend quyết định (`calculateMeterUsage`) — frontend KHÔNG
 * tái hiện logic đó (xem docs/FRONTEND.md mục "Quy tắc chuỗi tài chính (quan trọng)").
 * Xóa PHẢI được xác nhận (`confirmDangerousAction`) TRƯỚC khi gọi API.
 * `METER_READING_IN_USE` (sửa HOẶC xoá) hiển thị message THÂN THIỆN
 * riêng (`readingErrorMessage`) thay vì message thô của backend — xem
 * docs/MANAGEMENT_API.md mục "Historical reference protection".
 *
 * Không chịu trách nhiệm: implement CSDL/SQL — chỉ gọi API và render.
 */
let selectedPropertyId: string | null = null;
let selectedRoomId: string | null = null;
let editingReadingId: string | null = null;
let cachedRoomsForProperty: Room[] = [];
let cachedReadings: MeterReading[] = [];

export async function renderMeterReadingManagementPage(): Promise<void> {
  selectedPropertyId = null;
  selectedRoomId = null;
  editingReadingId = null;

  const container = getContentContainer();
  renderMeterReadingPage(container);
  wireSelectors();
  wireReadingForm();

  const propertySelect = document.querySelector<HTMLSelectElement>("#reading-property-select");
  const result = await fetchProperties();
  if (!result.success) {
    showGlobalAlert("danger", result.error.message);
    return;
  }
  if (propertySelect) {
    renderSelectOptions(propertySelect, result.data.map((p) => ({ id: p.id, label: p.name })), "-- Chọn cơ sở --");
  }
}

function wireSelectors(): void {
  const propertySelect = document.querySelector<HTMLSelectElement>("#reading-property-select");
  const roomSelect = document.querySelector<HTMLSelectElement>("#reading-room-select");
  const monthFilter = document.querySelector<HTMLInputElement>("#reading-month-filter");
  const addBtn = document.querySelector<HTMLButtonElement>("#reading-add-btn");
  if (monthFilter) wireMonthInputMask(monthFilter);

  propertySelect?.addEventListener("change", () => void handlePropertyChange());
  roomSelect?.addEventListener("change", () => void handleRoomChange());
  monthFilter?.addEventListener("change", () => {
    if (selectedRoomId) void loadReadingList();
  });
  addBtn?.addEventListener("click", () => {
    editingReadingId = null;
    const monthFilterValue = document.querySelector<HTMLInputElement>("#reading-month-filter")?.value;
    setReadingFormMode("create", undefined, monthFilterValue || undefined);
    document.querySelector<HTMLElement>("#reading-form-card")?.scrollIntoView({ behavior: "smooth" });
  });
}

async function handlePropertyChange(): Promise<void> {
  const propertySelect = document.querySelector<HTMLSelectElement>("#reading-property-select");
  const roomSelect = document.querySelector<HTMLSelectElement>("#reading-room-select");
  const listRegion = document.querySelector<HTMLElement>("#reading-list-region");
  if (!propertySelect || !roomSelect) return;

  selectedPropertyId = propertySelect.value || null;
  selectedRoomId = null;
  roomSelect.innerHTML = `<option value="">-- Chọn phòng --</option>`;
  roomSelect.disabled = true;
  setReadingAddButtonEnabled(false);
  setReadingFormVisible(false);
  if (listRegion) listRegion.innerHTML = `<p class="text-muted">Chọn phòng để xem lịch sử.</p>`;

  if (!selectedPropertyId) return;

  const result = await fetchRooms(selectedPropertyId);
  if (!result.success) {
    showGlobalAlert("danger", result.error.message);
    return;
  }
  cachedRoomsForProperty = result.data;
  if (cachedRoomsForProperty.length === 0) {
    showGlobalAlert("warning", "Cơ sở này chưa có phòng nào.");
    return;
  }
  renderSelectOptions(roomSelect, cachedRoomsForProperty.map((r) => ({ id: r.id, label: r.name })), "-- Chọn phòng --");
  roomSelect.disabled = false;
}

async function handleRoomChange(): Promise<void> {
  const roomSelect = document.querySelector<HTMLSelectElement>("#reading-room-select");
  if (!roomSelect) return;

  selectedRoomId = roomSelect.value || null;
  editingReadingId = null;

  if (!selectedRoomId) {
    setReadingAddButtonEnabled(false);
    setReadingFormVisible(false);
    return;
  }

  setReadingAddButtonEnabled(true);
  setReadingFormVisible(true);
  setReadingFormMode("create");
  await loadReadingList();
}

async function loadReadingList(): Promise<void> {
  const region = document.querySelector<HTMLElement>("#reading-list-region");
  if (!region || !selectedRoomId) return;
  renderLoading(region);

  const monthFilterValue = document.querySelector<HTMLInputElement>("#reading-month-filter")?.value.trim();
  let billingPeriodFilter: string | undefined;
  if (monthFilterValue) {
    const converted = monthDisplayToBillingPeriod(monthFilterValue);
    if (converted === null) {
      showGlobalAlert("warning", "Kỳ lọc không hợp lệ. Hãy nhập theo định dạng MM/YYYY.");
      renderEmptyState(region, "Không thể lọc theo kỳ đã nhập.");
      return;
    }
    billingPeriodFilter = converted;
  }

  const result = await fetchMeterReadings(selectedRoomId, billingPeriodFilter);
  if (!result.success) {
    showGlobalAlert("danger", result.error.message);
    renderEmptyState(region, "Không thể tải lịch sử ghi chỉ số.");
    return;
  }

  cachedReadings = result.data;
  renderReadingList(region, cachedReadings, billingPeriodFilter !== undefined);
  wireEditButtons();
}

function wireEditButtons(): void {
  document.querySelectorAll<HTMLButtonElement>(".app-edit-reading-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const reading = cachedReadings.find((r) => r.id === btn.dataset.id);
      if (!reading) return;
      editingReadingId = reading.id;
      setReadingFormMode("edit", reading);
      document.querySelector<HTMLElement>("#reading-form-card")?.scrollIntoView({ behavior: "smooth" });
    });
  });

  document.querySelectorAll<HTMLButtonElement>(".app-delete-reading-btn").forEach((btn) => {
    btn.addEventListener("click", () => void handleDeleteReading(btn));
  });
}

/** Message THÂN THIỆN cho `METER_READING_IN_USE`; mọi mã lỗi khác hiển thị nguyên văn message backend. */
function readingErrorMessage(error: { code: string; message: string }): string {
  if (error.code === "METER_READING_IN_USE") {
    return "Không thể xóa/sửa chỉ số này vì đã được dùng để tính hóa đơn.";
  }
  return error.message;
}

async function handleDeleteReading(btn: HTMLButtonElement): Promise<void> {
  const id = btn.dataset.id;
  if (!id) return;
  const reading = cachedReadings.find((r) => r.id === id);
  const description = reading
    ? `${utilityTypeDisplayLabel(reading.utilityType)} kỳ ${billingPeriodToMonthDisplay(reading.billingPeriod)}`
    : "này";

  if (!confirmDangerousAction(`Bạn có chắc muốn xóa chỉ số công tơ ${description}?`)) return;

  const result = await deleteMeterReading(id);
  if (!result.success) {
    showGlobalAlert("danger", readingErrorMessage(result.error));
    return;
  }

  showGlobalAlert("success", "Đã xóa chỉ số.");
  if (editingReadingId === id) {
    editingReadingId = null;
    setReadingFormMode("create");
  }
  await loadReadingList();
}

function wireReadingForm(): void {
  const form = document.querySelector<HTMLFormElement>("#reading-form");
  const cancelBtn = document.querySelector<HTMLButtonElement>("#reading-cancel-btn");
  const utilitySelect = document.querySelector<HTMLSelectElement>("#reading-utility-type");
  const monthInput = document.querySelector<HTMLInputElement>("#reading-billing-month");
  if (monthInput) wireMonthInputMask(monthInput);

  utilitySelect?.addEventListener("change", () => {
    setReadingUnitSuffix(utilitySelect.value as UtilityType);
  });

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitReadingForm();
  });

  cancelBtn?.addEventListener("click", () => {
    editingReadingId = null;
    const monthFilterValue = document.querySelector<HTMLInputElement>("#reading-month-filter")?.value;
    setReadingFormMode("create", undefined, monthFilterValue || undefined);
  });
}

/** Kiểm tra HÌNH DẠNG tối thiểu phía client — chỉ để tránh một round-trip vô ích, KHÔNG thay thế xác thực của backend. */
function isPlausibleDecimalShape(value: string): boolean {
  return /^\d+(\.\d+)?$/.test(value);
}

async function submitReadingForm(): Promise<void> {
  if (!selectedRoomId) {
    showGlobalAlert("warning", "Vui lòng chọn phòng.");
    return;
  }

  const utilitySelect = document.querySelector<HTMLSelectElement>("#reading-utility-type");
  const monthInput = document.querySelector<HTMLInputElement>("#reading-billing-month");
  const previousInput = document.querySelector<HTMLInputElement>("#reading-previous");
  const currentInput = document.querySelector<HTMLInputElement>("#reading-current");
  const maxInput = document.querySelector<HTMLInputElement>("#reading-max");
  if (!utilitySelect || !monthInput || !previousInput || !currentInput || !maxInput) return;

  if (!monthInput.value.trim()) {
    showGlobalAlert("warning", "Vui lòng nhập kỳ (tháng).");
    return;
  }
  const billingPeriod = monthDisplayToBillingPeriod(monthInput.value);
  if (billingPeriod === null) {
    showGlobalAlert("warning", "Kỳ (tháng) không hợp lệ. Hãy nhập theo định dạng MM/YYYY.");
    return;
  }
  const previous = previousInput.value.trim();
  const current = currentInput.value.trim();
  const max = maxInput.value.trim();
  if (!isPlausibleDecimalShape(previous) || !isPlausibleDecimalShape(current)) {
    showGlobalAlert("warning", "Chỉ số trước/hiện tại phải là số thập phân không âm.");
    return;
  }
  if (max.length > 0 && !isPlausibleDecimalShape(max)) {
    showGlobalAlert("warning", "Giá trị tối đa phải là số thập phân không âm, hoặc để trống.");
    return;
  }

  const body: MeterReadingBody = {
    roomId: selectedRoomId,
    billingPeriod,
    utilityType: utilitySelect.value as UtilityType,
    previousReading: previous,
    currentReading: current,
    meterMaximumValue: max.length === 0 ? null : max,
  };

  setReadingSubmitDisabled(true);
  try {
    const result = editingReadingId ? await updateMeterReading(editingReadingId, body) : await createMeterReading(body);

    if (!result.success) {
      showGlobalAlert("danger", readingErrorMessage(result.error));
      return;
    }

    showGlobalAlert("success", editingReadingId ? "Đã cập nhật chỉ số." : "Đã thêm chỉ số.");
    editingReadingId = null;
    setReadingFormMode("create");
    await loadReadingList();
  } finally {
    setReadingSubmitDisabled(false);
  }
}
