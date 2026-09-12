// SPDX-License-Identifier: MIT

import { escapeHtml } from "../utils/format";
import { utilityTypeDisplayLabel } from "../utils/labels";
import { renderEmptyState } from "./shared.view";
import type { MeterReading } from "../types/meter-reading.types";

/**
 * Trách nhiệm:
 * Render trang "Ghi chỉ số" — bộ chọn cơ sở/phòng/kỳ lọc, form thêm/
 * sửa MỘT chỉ số (điện HOẶC nước, không gộp), và bảng lịch sử.
 *
 * Không chịu trách nhiệm: gọi API, kiểm tra rollover/hợp lệ số liệu (backend là nơi
 * xác thực duy nhất qua calculateMeterUsage — xem
 * docs/MANAGEMENT_API.md mục "Tính hợp lệ rollover / tổ hợp chỉ số —
 * dùng lại, không cài đặt lại").
 */
export function renderMeterReadingPage(container: HTMLElement): void {
  container.innerHTML = `
    <div class="card mb-4">
      <div class="card-header">Chọn phòng và kỳ</div>
      <div class="card-body row g-3">
        <div class="col-md-4">
          <label for="reading-property-select" class="form-label">Cơ sở</label>
          <select class="form-select" id="reading-property-select"><option value="">-- Chọn cơ sở --</option></select>
        </div>
        <div class="col-md-4">
          <label for="reading-room-select" class="form-label">Phòng</label>
          <select class="form-select" id="reading-room-select" disabled><option value="">-- Chọn phòng --</option></select>
        </div>
        <div class="col-md-4">
          <label for="reading-month-filter" class="form-label">Lọc theo kỳ (không bắt buộc)</label>
          <input type="month" class="form-control" id="reading-month-filter" />
        </div>
      </div>
    </div>

    <div class="card mb-4 d-none" id="reading-form-card">
      <div class="card-header" id="reading-form-title">Thêm chỉ số</div>
      <div class="card-body">
        <form id="reading-form" novalidate>
          <input type="hidden" id="reading-form-id" value="" />
          <div class="row g-3">
            <div class="col-md-4">
              <label for="reading-utility-type" class="form-label">Loại</label>
              <select class="form-select" id="reading-utility-type" required>
                <option value="ELECTRICITY">Điện</option>
                <option value="WATER">Nước</option>
              </select>
            </div>
            <div class="col-md-4">
              <label for="reading-billing-month" class="form-label">Kỳ (tháng)</label>
              <input type="month" class="form-control" id="reading-billing-month" required />
            </div>
          </div>
          <div class="row g-3 mt-1">
            <div class="col-md-4">
              <label for="reading-previous" class="form-label">Chỉ số trước</label>
              <input type="text" inputmode="decimal" class="form-control" id="reading-previous" required />
            </div>
            <div class="col-md-4">
              <label for="reading-current" class="form-label">Chỉ số hiện tại</label>
              <input type="text" inputmode="decimal" class="form-control" id="reading-current" required />
            </div>
            <div class="col-md-4">
              <label for="reading-max" class="form-label">Giá trị tối đa (nếu có)</label>
              <input type="text" inputmode="decimal" class="form-control" id="reading-max" placeholder="Để trống nếu không có" />
            </div>
          </div>
          <div class="d-flex gap-2 mt-3">
            <button type="submit" class="btn btn-primary" id="reading-submit-btn">Lưu</button>
            <button type="button" class="btn btn-outline-secondary d-none" id="reading-cancel-btn">Hủy sửa</button>
          </div>
        </form>
      </div>
    </div>

    <div class="card">
      <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
        <span>Lịch sử ghi chỉ số</span>
        <button type="button" class="btn btn-sm btn-primary" id="reading-add-btn" disabled>Ghi chỉ số mới</button>
      </div>
      <div class="card-body">
        <div id="reading-list-region"><p class="text-muted">Chọn phòng để xem lịch sử.</p></div>
      </div>
    </div>
  `;
}

function billingPeriodToMonthLabel(billingPeriod: string): string {
  return `${billingPeriod.slice(5, 7)}/${billingPeriod.slice(0, 4)}`;
}

export function renderReadingList(regionEl: HTMLElement, readings: MeterReading[]): void {
  if (readings.length === 0) {
    renderEmptyState(regionEl, "Chưa có chỉ số nào cho phòng này.");
    return;
  }

  const rows = readings
    .map(
      (reading) => `
        <tr>
          <td>${escapeHtml(billingPeriodToMonthLabel(reading.billingPeriod))}</td>
          <td>${escapeHtml(utilityTypeDisplayLabel(reading.utilityType))}</td>
          <td>${escapeHtml(reading.previousReading)}</td>
          <td>${escapeHtml(reading.currentReading)}</td>
          <td>${reading.meterMaximumValue !== null ? escapeHtml(reading.meterMaximumValue) : "—"}</td>
          <td>
            <button type="button" class="btn btn-sm btn-outline-primary app-edit-reading-btn" data-id="${escapeHtml(reading.id)}">
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
        <thead><tr><th>Kỳ</th><th>Loại</th><th>Chỉ số trước</th><th>Chỉ số hiện tại</th><th>Giá trị tối đa</th><th>Thao tác</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

export function setReadingFormVisible(visible: boolean): void {
  document.querySelector<HTMLElement>("#reading-form-card")?.classList.toggle("d-none", !visible);
}

export function setReadingAddButtonEnabled(enabled: boolean): void {
  const btn = document.querySelector<HTMLButtonElement>("#reading-add-btn");
  if (btn) btn.disabled = !enabled;
}

export function setReadingFormMode(mode: "create" | "edit", reading?: MeterReading, prefillMonth?: string): void {
  const title = document.querySelector<HTMLElement>("#reading-form-title");
  const idInput = document.querySelector<HTMLInputElement>("#reading-form-id");
  const utilitySelect = document.querySelector<HTMLSelectElement>("#reading-utility-type");
  const monthInput = document.querySelector<HTMLInputElement>("#reading-billing-month");
  const previousInput = document.querySelector<HTMLInputElement>("#reading-previous");
  const currentInput = document.querySelector<HTMLInputElement>("#reading-current");
  const maxInput = document.querySelector<HTMLInputElement>("#reading-max");
  const cancelBtn = document.querySelector<HTMLButtonElement>("#reading-cancel-btn");
  if (!title || !idInput || !utilitySelect || !monthInput || !previousInput || !currentInput || !maxInput || !cancelBtn) return;

  if (mode === "edit" && reading) {
    title.textContent = "Sửa chỉ số";
    idInput.value = reading.id;
    utilitySelect.value = reading.utilityType;
    monthInput.value = reading.billingPeriod.slice(0, 7);
    previousInput.value = reading.previousReading;
    currentInput.value = reading.currentReading;
    maxInput.value = reading.meterMaximumValue ?? "";
    cancelBtn.classList.remove("d-none");
  } else {
    title.textContent = "Thêm chỉ số";
    idInput.value = "";
    utilitySelect.value = "ELECTRICITY";
    monthInput.value = prefillMonth ?? "";
    previousInput.value = "";
    currentInput.value = "";
    maxInput.value = "";
    cancelBtn.classList.add("d-none");
  }
}

export function setReadingSubmitDisabled(disabled: boolean): void {
  const btn = document.querySelector<HTMLButtonElement>("#reading-submit-btn");
  if (btn) btn.disabled = disabled;
}
