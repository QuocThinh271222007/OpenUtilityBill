// SPDX-License-Identifier: MIT

import {
  createElectricityTariff,
  createWaterTariff,
  fetchElectricityTariffs,
  fetchWaterTariffs,
  updateElectricityTariff,
  updateWaterTariff,
} from "../api/tariff.api";
import { getContentContainer } from "../views/layout.view";
import { renderEmptyState, renderLoading, showGlobalAlert } from "../views/shared.view";
import {
  renderElectricityTariffList,
  renderTariffPage,
  renderWaterTariffList,
  setElectricityTariffFormMode,
  setElectricityTariffSubmitDisabled,
  setWaterTariffFormMode,
  setWaterTariffSubmitDisabled,
  tierRowHtml,
  wireTariffTabs,
} from "../views/tariff.view";
import { displayDateToIsoDate, moneyDisplayToCanonical, percentInputToRateCanonical } from "../utils/format";
import { wireMoneyInput } from "../utils/money-input";
import { wireDateInputMask } from "../utils/masked-text-input";
import type { ElectricityTariffBody, ElectricityTariffTierInput, ElectricityTariffWithTiers, WaterTariff, WaterTariffBody } from "../types/tariff.types";

/**
 * Trách nhiệm:
 * Điều phối trang "Biểu giá" — hai tab độc lập (Điện/Nước). Phần điện
 * bao gồm TRÌNH SOẠN BẬC ĐỘNG (thêm/xoá dòng ở form, KHÔNG gọi API xoá
 * — chỉ là thao tác trên form, xem docs/MANAGEMENT_API.md mục "Dynamic
 * tiers").
 *
 * Bất biến quan trọng:
 * KHÔNG hard-code số bậc — trình soạn khởi tạo với MỘT dòng trống, cho
 * phép thêm/xoá tuỳ ý. `tierNumber` hiển thị được tự động đánh số lại
 * tuần tự sau mỗi lần thêm/xoá (chỉ để hiển thị — backend xác thực cấu
 * trúc bậc thật, xem docs/MANAGEMENT_API.md mục "Rate / quota /
 * fallback-tier validation").
 *
 * `TARIFF_IN_USE` khi sửa một biểu giá đã dùng trong hoá đơn lịch sử
 * hiển thị message CỤ THỂ theo yêu cầu (không phải message thô của
 * backend) — xem `tariffErrorMessage`.
 *
 * Không chịu trách nhiệm: implement công thức tính bậc thang/quota nào — chỉ thu
 * thập input và gọi API.
 */
let editingElectricityTariffId: string | null = null;
let cachedElectricityTariffs: ElectricityTariffWithTiers[] = [];
let editingWaterTariffId: string | null = null;
let cachedWaterTariffs: WaterTariff[] = [];

export async function renderTariffManagementPage(): Promise<void> {
  editingElectricityTariffId = null;
  editingWaterTariffId = null;

  const container = getContentContainer();
  renderTariffPage(container);
  wireTariffTabs();
  wireElectricityTariffForm();
  wireWaterTariffForm();
  resetTierEditor();

  await Promise.all([loadElectricityTariffList(), loadWaterTariffList()]);
}

/** Message CỤ THỂ theo yêu cầu cho `TARIFF_IN_USE`; mọi mã lỗi khác hiển thị nguyên văn message backend. */
function tariffErrorMessage(error: { code: string; message: string }): string {
  if (error.code === "TARIFF_IN_USE") {
    return "Biểu giá này đã được dùng trong hóa đơn lịch sử. Hãy tạo phiên bản biểu giá mới.";
  }
  return error.message;
}

// ==================== Electricity ====================

async function loadElectricityTariffList(): Promise<void> {
  const region = document.querySelector<HTMLElement>("#electricity-tariff-list-region");
  if (!region) return;
  renderLoading(region);

  const result = await fetchElectricityTariffs();
  if (!result.success) {
    showGlobalAlert("danger", result.error.message);
    renderEmptyState(region, "Không thể tải danh sách biểu giá điện.");
    return;
  }

  cachedElectricityTariffs = result.data;
  renderElectricityTariffList(region, cachedElectricityTariffs);
  wireElectricityEditButtons();
}

function wireElectricityEditButtons(): void {
  document.querySelectorAll<HTMLButtonElement>(".app-edit-electricity-tariff-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const data = cachedElectricityTariffs.find((t) => t.tariff.id === btn.dataset.id);
      if (!data) return;
      editingElectricityTariffId = data.tariff.id;
      setElectricityTariffFormMode("edit", data.tariff);
      rebuildTierEditor(data.tiers.map((t) => ({ tierNumber: t.tierNumber, thresholdKwh: t.thresholdKwh, unitPrice: t.unitPrice })));
      const fallbackSelect = document.querySelector<HTMLSelectElement>("#electricity-tariff-fallback-tier");
      if (fallbackSelect) fallbackSelect.value = String(data.tariff.fallbackTierNumber);
      document.querySelector<HTMLElement>("#electricity-tariff-form-title")?.scrollIntoView({ behavior: "smooth" });
    });
  });
}

function wireElectricityTariffForm(): void {
  const form = document.querySelector<HTMLFormElement>("#electricity-tariff-form");
  const cancelBtn = document.querySelector<HTMLButtonElement>("#electricity-tariff-cancel-btn");
  const addTierBtn = document.querySelector<HTMLButtonElement>("#electricity-tier-add-btn");
  const fromInput = document.querySelector<HTMLInputElement>("#electricity-tariff-effective-from");
  const toInput = document.querySelector<HTMLInputElement>("#electricity-tariff-effective-to");
  if (fromInput) wireDateInputMask(fromInput);
  if (toInput) wireDateInputMask(toInput);

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitElectricityTariffForm();
  });

  cancelBtn?.addEventListener("click", () => {
    editingElectricityTariffId = null;
    setElectricityTariffFormMode("create");
    resetTierEditor();
  });

  addTierBtn?.addEventListener("click", () => addTierRow());
}

// ---- Dynamic tier editor ----

function tierEditorEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>("#electricity-tiers-editor");
}

function tierRows(): HTMLElement[] {
  return Array.from(tierEditorEl()?.querySelectorAll<HTMLElement>("[data-tier-row]") ?? []);
}

/**
 * Định danh DUY NHẤT cho mỗi dòng bậc, tăng dần, KHÔNG BAO GIỜ tái sử
 * dụng — dùng làm `id`/`for` của checkbox "không giới hạn" trong
 * `tierRowHtml`. Tách biệt khỏi `tierNumber` hiển thị (vốn được đánh số
 * lại tuần tự sau mỗi lần thêm/xoá — xem `renumberTierRows`): nếu dùng
 * `tierNumber` làm `id`, một dòng mới tạo SAU KHI xoá một dòng ở giữa
 * có thể trùng `id` với một dòng CÒN LẠI (ví dụ xoá bậc 2 trong [1,2,3]
 * còn [1,3-hiển-thị-là-2], rồi thêm dòng mới -> tierNumber tính ra lại
 * là 3, trùng id với dòng "3" cũ) — một lỗi `id` trùng lặp trong DOM ảnh
 * hưởng khả năng bấm vào `<label>` để tích checkbox đúng dòng.
 */
let nextTierRowId = 1;

function resetTierEditor(): void {
  const editor = tierEditorEl();
  if (!editor) return;
  editor.innerHTML = "";
  editor.insertAdjacentHTML("beforeend", tierRowHtml(nextTierRowId++, 1, true, "", ""));
  wireTierRow(editor.querySelector<HTMLElement>("[data-tier-row]"));
  refreshFallbackTierOptions();
}

function rebuildTierEditor(tiers: ElectricityTariffTierInput[]): void {
  const editor = tierEditorEl();
  if (!editor) return;
  editor.innerHTML = "";
  tiers.forEach((tier) => {
    editor.insertAdjacentHTML(
      "beforeend",
      tierRowHtml(nextTierRowId++, tier.tierNumber, tier.thresholdKwh === null, tier.thresholdKwh ?? "", tier.unitPrice)
    );
  });
  tierRows().forEach(wireTierRow);
  refreshFallbackTierOptions();
}

function addTierRow(): void {
  const editor = tierEditorEl();
  if (!editor) return;

  const existingRows = tierRows();
  const lastRow = existingRows[existingRows.length - 1];
  if (lastRow) {
    const checkbox = lastRow.querySelector<HTMLInputElement>(".app-tier-unlimited");
    const thresholdInput = lastRow.querySelector<HTMLInputElement>(".app-tier-threshold");
    if (checkbox) checkbox.checked = false;
    if (thresholdInput) thresholdInput.disabled = false;
  }

  editor.insertAdjacentHTML("beforeend", tierRowHtml(nextTierRowId++, existingRows.length + 1, true, "", ""));
  const newRow = tierEditorEl()?.querySelector<HTMLElement>("[data-tier-row]:last-child");
  wireTierRow(newRow);
  renumberTierRows();
  refreshFallbackTierOptions();
}

function removeTierRow(rowEl: HTMLElement): void {
  if (tierRows().length <= 1) {
    showGlobalAlert("warning", "Biểu giá điện phải có ít nhất một bậc.");
    return;
  }
  rowEl.remove();
  renumberTierRows();
  refreshFallbackTierOptions();
}

function renumberTierRows(): void {
  tierRows().forEach((row, index) => {
    const numberInput = row.querySelector<HTMLInputElement>(".app-tier-number");
    if (numberInput) numberInput.value = String(index + 1);
  });
}

function wireTierRow(rowEl: HTMLElement | null | undefined): void {
  if (!rowEl) return;
  const removeBtn = rowEl.querySelector<HTMLButtonElement>(".app-tier-remove-btn");
  const unlimitedCheckbox = rowEl.querySelector<HTMLInputElement>(".app-tier-unlimited");
  const thresholdInput = rowEl.querySelector<HTMLInputElement>(".app-tier-threshold");
  const priceInput = rowEl.querySelector<HTMLInputElement>(".app-tier-price");
  if (priceInput) wireMoneyInput(priceInput);

  removeBtn?.addEventListener("click", () => removeTierRow(rowEl));
  unlimitedCheckbox?.addEventListener("change", () => {
    if (!thresholdInput) return;
    thresholdInput.disabled = unlimitedCheckbox.checked;
    if (unlimitedCheckbox.checked) thresholdInput.value = "";
  });
}

function collectTierRows(): ElectricityTariffTierInput[] {
  return tierRows().map((row, index) => {
    const unlimitedCheckbox = row.querySelector<HTMLInputElement>(".app-tier-unlimited");
    const thresholdInput = row.querySelector<HTMLInputElement>(".app-tier-threshold");
    const priceInput = row.querySelector<HTMLInputElement>(".app-tier-price");
    const isUnlimited = unlimitedCheckbox?.checked ?? false;
    const unitPriceCanonical = priceInput ? moneyDisplayToCanonical(priceInput.value) : null;
    return {
      tierNumber: index + 1,
      thresholdKwh: isUnlimited ? null : (thresholdInput?.value.trim() ?? ""),
      unitPrice: unitPriceCanonical ?? "",
    };
  });
}

function refreshFallbackTierOptions(): void {
  const select = document.querySelector<HTMLSelectElement>("#electricity-tariff-fallback-tier");
  if (!select) return;
  const currentValue = select.value;
  const tiers = collectTierRows();
  select.innerHTML = tiers.map((t) => `<option value="${t.tierNumber}">Bậc ${t.tierNumber}</option>`).join("");
  if (tiers.some((t) => String(t.tierNumber) === currentValue)) {
    select.value = currentValue;
  }
}

async function submitElectricityTariffForm(): Promise<void> {
  const nameInput = document.querySelector<HTMLInputElement>("#electricity-tariff-name");
  const fromInput = document.querySelector<HTMLInputElement>("#electricity-tariff-effective-from");
  const toInput = document.querySelector<HTMLInputElement>("#electricity-tariff-effective-to");
  const vatInput = document.querySelector<HTMLInputElement>("#electricity-tariff-vat");
  const peopleInput = document.querySelector<HTMLInputElement>("#electricity-tariff-people-per-quota");
  const fallbackSelect = document.querySelector<HTMLSelectElement>("#electricity-tariff-fallback-tier");
  if (!nameInput || !fromInput || !toInput || !vatInput || !peopleInput || !fallbackSelect) return;

  const name = nameInput.value.trim();
  if (name.length === 0) {
    showGlobalAlert("warning", "Vui lòng nhập tên biểu giá.");
    return;
  }
  const effectiveFrom = displayDateToIsoDate(fromInput.value);
  if (effectiveFrom === null) {
    showGlobalAlert("warning", "Ngày hiệu lực từ không hợp lệ. Hãy nhập theo định dạng DD/MM/YYYY.");
    return;
  }
  let effectiveTo: string | null = null;
  if (toInput.value.trim().length > 0) {
    effectiveTo = displayDateToIsoDate(toInput.value);
    if (effectiveTo === null) {
      showGlobalAlert("warning", "Ngày hiệu lực đến không hợp lệ. Hãy nhập theo định dạng DD/MM/YYYY.");
      return;
    }
  }
  const electricityVatRate = percentInputToRateCanonical(vatInput.value);
  if (electricityVatRate === null) {
    showGlobalAlert("warning", "VAT điện không hợp lệ.");
    return;
  }

  // peoplePerQuotaUnit/fallbackTierNumber là số nguyên đếm được (INTEGER
  // ở backend, không phải NUMERIC tài chính) — an toàn dùng
  // valueAsNumber/Number sau khi kiểm tra là số nguyên hợp lệ (xem
  // docs/FRONTEND.md mục "Field số nguyên và field thập phân tài chính").
  const peoplePerQuotaUnit = peopleInput.valueAsNumber;
  if (!Number.isInteger(peoplePerQuotaUnit) || peoplePerQuotaUnit <= 0) {
    showGlobalAlert("warning", "Số người / định mức phải là số nguyên dương.");
    return;
  }
  const fallbackTierNumber = Number(fallbackSelect.value);
  if (!Number.isInteger(fallbackTierNumber) || fallbackTierNumber <= 0) {
    showGlobalAlert("warning", "Vui lòng chọn bậc fallback.");
    return;
  }

  const tiers = collectTierRows();
  if (tiers.some((t) => t.unitPrice.length === 0)) {
    showGlobalAlert("warning", "Số tiền không hợp lệ. Vui lòng nhập đơn giá cho mọi bậc.");
    return;
  }
  if (tiers.some((t) => t.thresholdKwh === "" )) {
    showGlobalAlert("warning", "Vui lòng nhập ngưỡng cho các bậc không phải bậc cuối.");
    return;
  }

  const body: ElectricityTariffBody = {
    name,
    effectiveFrom,
    effectiveTo,
    electricityVatRate,
    peoplePerQuotaUnit,
    fallbackTierNumber,
    tiers,
  };

  setElectricityTariffSubmitDisabled(true);
  try {
    const result = editingElectricityTariffId
      ? await updateElectricityTariff(editingElectricityTariffId, body)
      : await createElectricityTariff(body);

    if (!result.success) {
      showGlobalAlert("danger", tariffErrorMessage(result.error));
      return;
    }

    showGlobalAlert("success", editingElectricityTariffId ? "Đã cập nhật biểu giá điện." : "Đã thêm biểu giá điện.");
    editingElectricityTariffId = null;
    setElectricityTariffFormMode("create");
    resetTierEditor();
    await loadElectricityTariffList();
  } finally {
    setElectricityTariffSubmitDisabled(false);
  }
}

// ==================== Water ====================

async function loadWaterTariffList(): Promise<void> {
  const region = document.querySelector<HTMLElement>("#water-tariff-list-region");
  if (!region) return;
  renderLoading(region);

  const result = await fetchWaterTariffs();
  if (!result.success) {
    showGlobalAlert("danger", result.error.message);
    renderEmptyState(region, "Không thể tải danh sách biểu giá nước.");
    return;
  }

  cachedWaterTariffs = result.data;
  renderWaterTariffList(region, cachedWaterTariffs);
  wireWaterEditButtons();
}

function wireWaterEditButtons(): void {
  document.querySelectorAll<HTMLButtonElement>(".app-edit-water-tariff-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tariff = cachedWaterTariffs.find((t) => t.id === btn.dataset.id);
      if (!tariff) return;
      editingWaterTariffId = tariff.id;
      setWaterTariffFormMode("edit", tariff);
      document.querySelector<HTMLElement>("#water-tariff-form-title")?.scrollIntoView({ behavior: "smooth" });
    });
  });
}

function wireWaterTariffForm(): void {
  const form = document.querySelector<HTMLFormElement>("#water-tariff-form");
  const cancelBtn = document.querySelector<HTMLButtonElement>("#water-tariff-cancel-btn");
  const cubicInput = document.querySelector<HTMLInputElement>("#water-tariff-price-cubic-meter");
  const personInput = document.querySelector<HTMLInputElement>("#water-tariff-price-person");
  const fromInput = document.querySelector<HTMLInputElement>("#water-tariff-effective-from");
  const toInput = document.querySelector<HTMLInputElement>("#water-tariff-effective-to");
  if (cubicInput) wireMoneyInput(cubicInput);
  if (personInput) wireMoneyInput(personInput);
  if (fromInput) wireDateInputMask(fromInput);
  if (toInput) wireDateInputMask(toInput);

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitWaterTariffForm();
  });

  cancelBtn?.addEventListener("click", () => {
    editingWaterTariffId = null;
    setWaterTariffFormMode("create");
  });
}

async function submitWaterTariffForm(): Promise<void> {
  const nameInput = document.querySelector<HTMLInputElement>("#water-tariff-name");
  const fromInput = document.querySelector<HTMLInputElement>("#water-tariff-effective-from");
  const toInput = document.querySelector<HTMLInputElement>("#water-tariff-effective-to");
  const cubicInput = document.querySelector<HTMLInputElement>("#water-tariff-price-cubic-meter");
  const personInput = document.querySelector<HTMLInputElement>("#water-tariff-price-person");
  const vatInput = document.querySelector<HTMLInputElement>("#water-tariff-vat");
  const feeInput = document.querySelector<HTMLInputElement>("#water-tariff-environmental-fee");
  if (!nameInput || !fromInput || !toInput || !cubicInput || !personInput || !vatInput || !feeInput) return;

  const name = nameInput.value.trim();
  if (name.length === 0) {
    showGlobalAlert("warning", "Vui lòng nhập tên biểu giá.");
    return;
  }
  const effectiveFrom = displayDateToIsoDate(fromInput.value);
  if (effectiveFrom === null) {
    showGlobalAlert("warning", "Ngày hiệu lực từ không hợp lệ. Hãy nhập theo định dạng DD/MM/YYYY.");
    return;
  }
  let effectiveTo: string | null = null;
  if (toInput.value.trim().length > 0) {
    effectiveTo = displayDateToIsoDate(toInput.value);
    if (effectiveTo === null) {
      showGlobalAlert("warning", "Ngày hiệu lực đến không hợp lệ. Hãy nhập theo định dạng DD/MM/YYYY.");
      return;
    }
  }
  const pricePerCubicMeter = moneyDisplayToCanonical(cubicInput.value);
  const pricePerPerson = moneyDisplayToCanonical(personInput.value);
  if (pricePerCubicMeter === null || pricePerPerson === null) {
    showGlobalAlert("warning", "Số tiền không hợp lệ.");
    return;
  }
  const vatRate = percentInputToRateCanonical(vatInput.value);
  const environmentalFeeRate = percentInputToRateCanonical(feeInput.value);
  if (vatRate === null || environmentalFeeRate === null) {
    showGlobalAlert("warning", "VAT hoặc phí môi trường không hợp lệ.");
    return;
  }

  const body: WaterTariffBody = {
    name,
    effectiveFrom,
    effectiveTo,
    pricePerCubicMeter,
    pricePerPerson,
    vatRate,
    environmentalFeeRate,
  };

  setWaterTariffSubmitDisabled(true);
  try {
    const result = editingWaterTariffId ? await updateWaterTariff(editingWaterTariffId, body) : await createWaterTariff(body);

    if (!result.success) {
      showGlobalAlert("danger", tariffErrorMessage(result.error));
      return;
    }

    showGlobalAlert("success", editingWaterTariffId ? "Đã cập nhật biểu giá nước." : "Đã thêm biểu giá nước.");
    editingWaterTariffId = null;
    setWaterTariffFormMode("create");
    await loadWaterTariffList();
  } finally {
    setWaterTariffSubmitDisabled(false);
  }
}
