// SPDX-License-Identifier: MIT

import { escapeHtml, formatMoneyInputDisplay, formatVndDisplay, isoDateToDisplayDate, rateCanonicalToPercentDisplay } from "../utils/format";
import { setMoneyInputFromCanonical } from "../utils/money-input";
import { pageIntroHtml, renderEmptyState, setButtonBusyState } from "./shared.view";
import type { ElectricityTariffTier, ElectricityTariffWithTiers, WaterTariff } from "../types/tariff.types";

/**
 * Trách nhiệm:
 * Render trang "Biểu giá" — hai tab (Điện/Nước, chuyển bằng DOM
 * show/hide thuần, KHÔNG dùng Bootstrap JS — xem docs/FRONTEND.md mục
 * "Công nghệ (đã khoá)"), danh sách phiên bản biểu giá điện kèm bảng
 * bậc động, form tạo/sửa với TRÌNH SOẠN BẬC ĐỘNG (thêm/xoá dòng bậc),
 * và form biểu giá nước đơn giản hơn (không có bậc).
 *
 * Bất biến quan trọng:
 * KHÔNG giả định số bậc cố định — `renderElectricityTariffList` render
 * ĐÚNG số bậc mà mỗi phiên bản tariff thực có (xem docs/FRONTEND.md mục
 * "Trình soạn tier biểu giá điện động").
 *
 * Không chịu trách nhiệm: gọi API, validate cấu hình bậc/tỉ lệ — backend là nơi xác
 * thực có thẩm quyền duy nhất.
 */
export function renderTariffPage(container: HTMLElement): void {
  container.innerHTML = `
    ${pageIntroHtml("Cấu hình biểu giá điện và nước áp dụng cho việc tính hoá đơn.")}
    <div class="btn-group mb-3" role="group" aria-label="Chọn loại biểu giá">
      <button type="button" class="btn btn-outline-primary active" id="tariff-tab-electricity" data-tariff-tab="electricity">Điện</button>
      <button type="button" class="btn btn-outline-primary" id="tariff-tab-water" data-tariff-tab="water">Nước</button>
    </div>

    <div id="tariff-panel-electricity">
      <div class="card mb-4 app-form-card">
        <div class="card-header" id="electricity-tariff-form-title">Thêm biểu giá điện</div>
        <div class="card-body">
          <form id="electricity-tariff-form" novalidate>
            <input type="hidden" id="electricity-tariff-form-id" value="" />
            <div class="row g-3">
              <div class="col-md-6">
                <label for="electricity-tariff-name" class="form-label">Tên biểu giá</label>
                <input type="text" class="form-control" id="electricity-tariff-name" required />
              </div>
              <div class="col-md-3">
                <label for="electricity-tariff-effective-from" class="form-label">Hiệu lực từ</label>
                <input type="text" inputmode="numeric" class="form-control" id="electricity-tariff-effective-from" placeholder="dd/mm/yyyy" required />
              </div>
              <div class="col-md-3">
                <label for="electricity-tariff-effective-to" class="form-label">Hiệu lực đến</label>
                <input type="text" inputmode="numeric" class="form-control" id="electricity-tariff-effective-to" placeholder="dd/mm/yyyy" aria-describedby="electricity-tariff-effective-to-help" />
                <div class="form-text" id="electricity-tariff-effective-to-help">Để trống nếu biểu giá không có ngày kết thúc.</div>
              </div>
            </div>
            <div class="row g-3 mt-1">
              <div class="col-md-4">
                <label for="electricity-tariff-vat" class="form-label">VAT điện</label>
                <div class="input-group">
                  <input type="text" inputmode="decimal" class="form-control" id="electricity-tariff-vat" placeholder="8" required />
                  <span class="input-group-text">%</span>
                </div>
              </div>
              <div class="col-md-4">
                <label for="electricity-tariff-people-per-quota" class="form-label">Số người / định mức</label>
                <input type="number" min="1" step="1" class="form-control" id="electricity-tariff-people-per-quota" required />
              </div>
              <div class="col-md-4">
                <label for="electricity-tariff-fallback-tier" class="form-label">Bậc fallback</label>
                <select class="form-select" id="electricity-tariff-fallback-tier" required></select>
              </div>
            </div>

            <hr class="my-3" />
            <h2 class="h6">Các bậc giá</h2>
            <div id="electricity-tiers-editor"></div>
            <button type="button" class="btn btn-outline-primary btn-sm" id="electricity-tier-add-btn">Thêm bậc</button>

            <div class="d-flex gap-2 mt-4">
              <button type="submit" class="btn btn-primary" id="electricity-tariff-submit-btn">Lưu</button>
              <button type="button" class="btn btn-outline-secondary d-none" id="electricity-tariff-cancel-btn">Hủy sửa</button>
            </div>
          </form>
        </div>
      </div>

      <div class="card">
        <div class="card-header">Danh sách biểu giá điện</div>
        <div class="card-body">
          <div id="electricity-tariff-list-region"></div>
        </div>
      </div>
    </div>

    <div id="tariff-panel-water" class="d-none">
      <div class="card mb-4 app-form-card">
        <div class="card-header" id="water-tariff-form-title">Thêm biểu giá nước</div>
        <div class="card-body">
          <form id="water-tariff-form" novalidate>
            <input type="hidden" id="water-tariff-form-id" value="" />
            <div class="row g-3">
              <div class="col-md-6">
                <label for="water-tariff-name" class="form-label">Tên biểu giá</label>
                <input type="text" class="form-control" id="water-tariff-name" required />
              </div>
              <div class="col-md-3">
                <label for="water-tariff-effective-from" class="form-label">Hiệu lực từ</label>
                <input type="text" inputmode="numeric" class="form-control" id="water-tariff-effective-from" placeholder="dd/mm/yyyy" required />
              </div>
              <div class="col-md-3">
                <label for="water-tariff-effective-to" class="form-label">Hiệu lực đến</label>
                <input type="text" inputmode="numeric" class="form-control" id="water-tariff-effective-to" placeholder="dd/mm/yyyy" aria-describedby="water-tariff-effective-to-help" />
                <div class="form-text" id="water-tariff-effective-to-help">Để trống nếu biểu giá không có ngày kết thúc.</div>
              </div>
            </div>
            <div class="row g-3 mt-1">
              <div class="col-md-3">
                <label for="water-tariff-price-cubic-meter" class="form-label">Giá / m³</label>
                <div class="input-group">
                  <input type="text" inputmode="decimal" class="form-control" id="water-tariff-price-cubic-meter" required />
                  <span class="input-group-text">đ/m³</span>
                </div>
              </div>
              <div class="col-md-3">
                <label for="water-tariff-price-person" class="form-label">Giá / người</label>
                <div class="input-group">
                  <input type="text" inputmode="decimal" class="form-control" id="water-tariff-price-person" required />
                  <span class="input-group-text">đ/người/tháng</span>
                </div>
              </div>
              <div class="col-md-3">
                <label for="water-tariff-vat" class="form-label">VAT nước</label>
                <div class="input-group">
                  <input type="text" inputmode="decimal" class="form-control" id="water-tariff-vat" placeholder="5" required />
                  <span class="input-group-text">%</span>
                </div>
              </div>
              <div class="col-md-3">
                <label for="water-tariff-environmental-fee" class="form-label">Phí môi trường</label>
                <div class="input-group">
                  <input type="text" inputmode="decimal" class="form-control" id="water-tariff-environmental-fee" placeholder="10" required />
                  <span class="input-group-text">%</span>
                </div>
              </div>
            </div>
            <div class="d-flex gap-2 mt-4">
              <button type="submit" class="btn btn-primary" id="water-tariff-submit-btn">Lưu</button>
              <button type="button" class="btn btn-outline-secondary d-none" id="water-tariff-cancel-btn">Hủy sửa</button>
            </div>
          </form>
        </div>
      </div>

      <div class="card">
        <div class="card-header">Danh sách biểu giá nước</div>
        <div class="card-body">
          <div id="water-tariff-list-region"></div>
        </div>
      </div>
    </div>
  `;
}

export function wireTariffTabs(): void {
  const electricityTab = document.querySelector<HTMLButtonElement>("#tariff-tab-electricity");
  const waterTab = document.querySelector<HTMLButtonElement>("#tariff-tab-water");
  const electricityPanel = document.querySelector<HTMLElement>("#tariff-panel-electricity");
  const waterPanel = document.querySelector<HTMLElement>("#tariff-panel-water");
  if (!electricityTab || !waterTab || !electricityPanel || !waterPanel) return;

  electricityTab.addEventListener("click", () => {
    electricityTab.classList.add("active");
    waterTab.classList.remove("active");
    electricityPanel.classList.remove("d-none");
    waterPanel.classList.add("d-none");
  });
  waterTab.addEventListener("click", () => {
    waterTab.classList.add("active");
    electricityTab.classList.remove("active");
    waterPanel.classList.remove("d-none");
    electricityPanel.classList.add("d-none");
  });
}

// ---- Electricity tariff list ----

export function renderElectricityTariffList(regionEl: HTMLElement, tariffs: ElectricityTariffWithTiers[]): void {
  if (tariffs.length === 0) {
    renderEmptyState(regionEl, "Chưa có biểu giá điện nào.");
    return;
  }
  regionEl.innerHTML = tariffs.map(electricityTariffCardHtml).join("");
}

function electricityTierRowHtml(tier: ElectricityTariffTier): string {
  return `
    <tr>
      <td>${tier.tierNumber}</td>
      <td class="app-numeric">${tier.thresholdKwh !== null ? `${escapeHtml(tier.thresholdKwh)} kWh` : "Không giới hạn"}</td>
      <td class="app-numeric">${escapeHtml(formatVndDisplay(tier.unitPrice))}/kWh</td>
    </tr>
  `;
}

function electricityTariffCardHtml(data: ElectricityTariffWithTiers): string {
  const { tariff, tiers } = data;
  const effectiveRange = `${isoDateToDisplayDate(tariff.effectiveFrom)} — ${tariff.effectiveTo !== null ? isoDateToDisplayDate(tariff.effectiveTo) : "Không giới hạn"}`;
  const tierRows = tiers.map(electricityTierRowHtml).join("");

  return `
    <div class="card mb-3">
      <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
        <span>${escapeHtml(tariff.name)}</span>
        <button type="button" class="btn btn-sm btn-outline-primary app-edit-electricity-tariff-btn" data-id="${escapeHtml(tariff.id)}">
          Sửa
        </button>
      </div>
      <div class="card-body">
        <dl class="row mb-3">
          <dt class="col-sm-3">Hiệu lực</dt><dd class="col-sm-9">${escapeHtml(effectiveRange)}</dd>
          <dt class="col-sm-3">VAT điện</dt><dd class="col-sm-9">${escapeHtml(rateCanonicalToPercentDisplay(tariff.electricityVatRate))}%</dd>
          <dt class="col-sm-3">Người / định mức</dt><dd class="col-sm-9">${tariff.peoplePerQuotaUnit}</dd>
          <dt class="col-sm-3">Bậc fallback</dt><dd class="col-sm-9">Bậc ${tariff.fallbackTierNumber}</dd>
        </dl>
        <div class="table-responsive">
          <table class="table table-sm table-bordered mb-0 app-table">
            <thead><tr><th>Bậc</th><th class="app-numeric">Ngưỡng</th><th class="app-numeric">Đơn giá</th></tr></thead>
            <tbody>${tierRows}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// ---- Electricity tariff form (parent fields) ----

export function setElectricityTariffFormMode(mode: "create" | "edit", tariff?: ElectricityTariffWithTiers["tariff"]): void {
  const title = document.querySelector<HTMLElement>("#electricity-tariff-form-title");
  const idInput = document.querySelector<HTMLInputElement>("#electricity-tariff-form-id");
  const nameInput = document.querySelector<HTMLInputElement>("#electricity-tariff-name");
  const fromInput = document.querySelector<HTMLInputElement>("#electricity-tariff-effective-from");
  const toInput = document.querySelector<HTMLInputElement>("#electricity-tariff-effective-to");
  const vatInput = document.querySelector<HTMLInputElement>("#electricity-tariff-vat");
  const peopleInput = document.querySelector<HTMLInputElement>("#electricity-tariff-people-per-quota");
  const cancelBtn = document.querySelector<HTMLButtonElement>("#electricity-tariff-cancel-btn");
  if (!title || !idInput || !nameInput || !fromInput || !toInput || !vatInput || !peopleInput || !cancelBtn) return;

  if (mode === "edit" && tariff) {
    title.textContent = `Sửa biểu giá điện: ${tariff.name}`;
    idInput.value = tariff.id;
    nameInput.value = tariff.name;
    fromInput.value = isoDateToDisplayDate(tariff.effectiveFrom);
    toInput.value = tariff.effectiveTo !== null ? isoDateToDisplayDate(tariff.effectiveTo) : "";
    vatInput.value = rateCanonicalToPercentDisplay(tariff.electricityVatRate);
    peopleInput.value = String(tariff.peoplePerQuotaUnit);
    cancelBtn.classList.remove("d-none");
  } else {
    title.textContent = "Thêm biểu giá điện";
    idInput.value = "";
    nameInput.value = "";
    fromInput.value = "";
    toInput.value = "";
    vatInput.value = "";
    peopleInput.value = "";
    cancelBtn.classList.add("d-none");
  }
}

export function setElectricityTariffSubmitDisabled(disabled: boolean): void {
  const btn = document.querySelector<HTMLButtonElement>("#electricity-tariff-submit-btn");
  if (btn) setButtonBusyState(btn, disabled, "Đang lưu…");
}

// ---- Dynamic tier editor ----

// ---- Water tariff list + form ----

export function renderWaterTariffList(regionEl: HTMLElement, tariffs: WaterTariff[]): void {
  if (tariffs.length === 0) {
    renderEmptyState(regionEl, "Chưa có biểu giá nước nào.");
    return;
  }
  const cards = tariffs.map(waterTariffCardHtml).join("");
  regionEl.innerHTML = cards;
}

function waterTariffCardHtml(tariff: WaterTariff): string {
  const effectiveRange = `${isoDateToDisplayDate(tariff.effectiveFrom)} — ${tariff.effectiveTo !== null ? isoDateToDisplayDate(tariff.effectiveTo) : "Không giới hạn"}`;
  return `
    <div class="card mb-3">
      <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
        <span>${escapeHtml(tariff.name)}</span>
        <button type="button" class="btn btn-sm btn-outline-primary app-edit-water-tariff-btn" data-id="${escapeHtml(tariff.id)}">
          Sửa
        </button>
      </div>
      <div class="card-body">
        <dl class="row mb-0">
          <dt class="col-sm-3">Hiệu lực</dt><dd class="col-sm-9">${escapeHtml(effectiveRange)}</dd>
          <dt class="col-sm-3">Giá / m³</dt><dd class="col-sm-9">${escapeHtml(formatVndDisplay(tariff.pricePerCubicMeter))}/m³</dd>
          <dt class="col-sm-3">Giá / người</dt><dd class="col-sm-9">${escapeHtml(formatVndDisplay(tariff.pricePerPerson))}/người/tháng</dd>
          <dt class="col-sm-3">VAT nước</dt><dd class="col-sm-9">${escapeHtml(rateCanonicalToPercentDisplay(tariff.vatRate))}%</dd>
          <dt class="col-sm-3">Phí môi trường</dt><dd class="col-sm-9">${escapeHtml(rateCanonicalToPercentDisplay(tariff.environmentalFeeRate))}%</dd>
        </dl>
      </div>
    </div>
  `;
}

export function setWaterTariffFormMode(mode: "create" | "edit", tariff?: WaterTariff): void {
  const title = document.querySelector<HTMLElement>("#water-tariff-form-title");
  const idInput = document.querySelector<HTMLInputElement>("#water-tariff-form-id");
  const nameInput = document.querySelector<HTMLInputElement>("#water-tariff-name");
  const fromInput = document.querySelector<HTMLInputElement>("#water-tariff-effective-from");
  const toInput = document.querySelector<HTMLInputElement>("#water-tariff-effective-to");
  const cubicInput = document.querySelector<HTMLInputElement>("#water-tariff-price-cubic-meter");
  const personInput = document.querySelector<HTMLInputElement>("#water-tariff-price-person");
  const vatInput = document.querySelector<HTMLInputElement>("#water-tariff-vat");
  const feeInput = document.querySelector<HTMLInputElement>("#water-tariff-environmental-fee");
  const cancelBtn = document.querySelector<HTMLButtonElement>("#water-tariff-cancel-btn");
  if (!title || !idInput || !nameInput || !fromInput || !toInput || !cubicInput || !personInput || !vatInput || !feeInput || !cancelBtn) {
    return;
  }

  if (mode === "edit" && tariff) {
    title.textContent = `Sửa biểu giá nước: ${tariff.name}`;
    idInput.value = tariff.id;
    nameInput.value = tariff.name;
    fromInput.value = isoDateToDisplayDate(tariff.effectiveFrom);
    toInput.value = tariff.effectiveTo !== null ? isoDateToDisplayDate(tariff.effectiveTo) : "";
    setMoneyInputFromCanonical(cubicInput, tariff.pricePerCubicMeter);
    setMoneyInputFromCanonical(personInput, tariff.pricePerPerson);
    vatInput.value = rateCanonicalToPercentDisplay(tariff.vatRate);
    feeInput.value = rateCanonicalToPercentDisplay(tariff.environmentalFeeRate);
    cancelBtn.classList.remove("d-none");
  } else {
    title.textContent = "Thêm biểu giá nước";
    idInput.value = "";
    nameInput.value = "";
    fromInput.value = "";
    toInput.value = "";
    setMoneyInputFromCanonical(cubicInput, "");
    setMoneyInputFromCanonical(personInput, "");
    vatInput.value = "";
    feeInput.value = "";
    cancelBtn.classList.add("d-none");
  }
}

export function setWaterTariffSubmitDisabled(disabled: boolean): void {
  const btn = document.querySelector<HTMLButtonElement>("#water-tariff-submit-btn");
  if (btn) setButtonBusyState(btn, disabled, "Đang lưu…");
}

// ---- Dynamic tier editor ----

/**
 * `rowId` là một số ĐỊNH DANH DUY NHẤT cho dòng (cấp bởi Controller,
 * KHÔNG BAO GIỜ tái sử dụng kể cả sau khi xoá dòng khác) — dùng làm
 * `id`/`for` của checkbox "không giới hạn" để KHÔNG BAO GIỜ trùng `id`
 * trong DOM. `tierNumber` CHỈ để hiển thị (đánh số lại tuần tự sau mỗi
 * lần thêm/xoá dòng, xem `renumberTierRows` ở controller) — hai giá trị
 * này CỐ Ý tách biệt, vì `tierNumber` đổi liên tục còn `rowId` của một
 * dòng thì không.
 */
export function tierRowHtml(rowId: number, tierNumber: number, isUnlimited: boolean, thresholdKwh: string, unitPrice: string): string {
  return `
    <div class="row g-2 align-items-end app-tier-row mb-2" data-tier-row>
      <div class="col-auto">
        <label class="form-label">Bậc</label>
        <input type="text" class="form-control app-tier-number" value="${tierNumber}" disabled />
      </div>
      <div class="col">
        <label class="form-label">Ngưỡng</label>
        <div class="input-group">
          <input
            type="text"
            inputmode="decimal"
            class="form-control app-tier-threshold"
            value="${escapeHtml(thresholdKwh)}"
            ${isUnlimited ? "disabled" : ""}
          />
          <span class="input-group-text">kWh</span>
        </div>
      </div>
      <div class="col">
        <label class="form-label">Đơn giá</label>
        <div class="input-group">
          <input type="text" inputmode="decimal" class="form-control app-tier-price" value="${escapeHtml(formatMoneyInputDisplay(unitPrice))}" required />
          <span class="input-group-text">đ/kWh</span>
        </div>
      </div>
      <div class="col-auto form-check">
        <input type="checkbox" class="form-check-input app-tier-unlimited" id="tier-unlimited-${rowId}" ${isUnlimited ? "checked" : ""} />
        <label class="form-check-label" for="tier-unlimited-${rowId}">Bậc cuối / không giới hạn</label>
      </div>
      <div class="col-auto">
        <button type="button" class="btn btn-outline-danger app-tier-remove-btn">Xóa</button>
      </div>
    </div>
  `;
}
