// SPDX-License-Identifier: MIT

import { fetchProperties } from "../api/property.api";
import { fetchRooms } from "../api/room.api";
import { createInvoice, fetchInvoice } from "../api/invoice.api";
import { getContentContainer } from "../views/layout.view";
import { renderLoading, renderSelectOptions, showGlobalAlert } from "../views/shared.view";
import {
  renderInvoiceAlreadyExistsPrompt,
  renderInvoiceNotFound,
  renderInvoicePage,
  renderInvoiceResult,
  setInvoiceSubmitDisabled,
} from "../views/invoice.view";
import { monthInputToBillingPeriod } from "../utils/format";
import type { CreateInvoiceBody } from "../types/invoice.types";
import type { Room } from "../types/room.types";

/**
 * Trách nhiệm:
 * Điều phối trang "Hóa đơn" — MÀN HÌNH DEMO QUAN TRỌNG NHẤT: tạo hóa
 * đơn mới (POST), xử lý trường hợp đã tồn tại (409
 * INVOICE_ALREADY_EXISTS -> đề nghị tải hóa đơn đã lưu), và đọc lại một
 * hóa đơn LỊCH SỬ (GET, không tính lại) — xem docs/CREATE_INVOICE_WORKFLOW.md.
 *
 * Bất biến quan trọng:
 * KHÔNG BAO GIỜ tính toán số tiền ở đây — chỉ gửi input, hiển thị kết
 * quả `CreateInvoiceResult`/`GetInvoiceResult` NGUYÊN VẸN từ backend
 * (xem docs/FRONTEND.md mục "Financial string rule"). `actualChargedAmount`
 * trống -> gửi `null`, KHÔNG BAO GIỜ gửi chuỗi rỗng `""`.
 *
 * Không chịu trách nhiệm: gọi lại Calculation Core, dựng lại breakdown từ
 * quantity × unitPrice.
 */
let selectedRoomId: string | null = null;
let selectedRoomLabel = "";
let cachedRoomsForProperty: Room[] = [];

export async function renderInvoiceManagementPage(): Promise<void> {
  selectedRoomId = null;
  selectedRoomLabel = "";

  const container = getContentContainer();
  renderInvoicePage(container);
  wireInvoiceForm();
  await populatePropertySelect();
}

async function populatePropertySelect(): Promise<void> {
  const propertySelect = document.querySelector<HTMLSelectElement>("#invoice-property-select");
  if (!propertySelect) return;

  const result = await fetchProperties();
  if (!result.success) {
    showGlobalAlert("danger", result.error.message);
    return;
  }
  renderSelectOptions(propertySelect, result.data.map((p) => ({ id: p.id, label: p.name })), "-- Chọn cơ sở --");
}

function wireInvoiceForm(): void {
  const propertySelect = document.querySelector<HTMLSelectElement>("#invoice-property-select");
  const roomSelect = document.querySelector<HTMLSelectElement>("#invoice-room-select");
  const form = document.querySelector<HTMLFormElement>("#invoice-form");
  const viewExistingBtn = document.querySelector<HTMLButtonElement>("#invoice-view-existing-btn");

  propertySelect?.addEventListener("change", () => void handlePropertyChange());
  roomSelect?.addEventListener("change", () => {
    selectedRoomId = roomSelect.value || null;
    const room = cachedRoomsForProperty.find((r) => r.id === selectedRoomId);
    selectedRoomLabel = room ? room.name : "";
  });
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitCreateInvoice();
  });
  viewExistingBtn?.addEventListener("click", () => void loadExistingInvoice());
}

async function handlePropertyChange(): Promise<void> {
  const propertySelect = document.querySelector<HTMLSelectElement>("#invoice-property-select");
  const roomSelect = document.querySelector<HTMLSelectElement>("#invoice-room-select");
  if (!propertySelect || !roomSelect) return;

  const propertyId = propertySelect.value || null;
  selectedRoomId = null;
  selectedRoomLabel = "";
  roomSelect.innerHTML = `<option value="">-- Chọn phòng --</option>`;
  roomSelect.disabled = true;
  if (!propertyId) return;

  const result = await fetchRooms(propertyId);
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

function readInvoiceFormCommon(): { roomId: string; billingPeriod: string } | null {
  const monthInput = document.querySelector<HTMLInputElement>("#invoice-month");
  if (!selectedRoomId) {
    showGlobalAlert("warning", "Vui lòng chọn phòng.");
    return null;
  }
  if (!monthInput || !monthInput.value) {
    showGlobalAlert("warning", "Vui lòng chọn kỳ hóa đơn.");
    return null;
  }
  return { roomId: selectedRoomId, billingPeriod: monthInputToBillingPeriod(monthInput.value) };
}

async function submitCreateInvoice(): Promise<void> {
  const common = readInvoiceFormCommon();
  if (!common) return;

  const electricitySelect = document.querySelector<HTMLSelectElement>("#invoice-electricity-method");
  const waterSelect = document.querySelector<HTMLSelectElement>("#invoice-water-method");
  const actualInput = document.querySelector<HTMLInputElement>("#invoice-actual-charged");
  if (!electricitySelect || !waterSelect || !actualInput) return;

  const actualRaw = actualInput.value.trim();
  const body: CreateInvoiceBody = {
    roomId: common.roomId,
    billingPeriod: common.billingPeriod,
    electricityBillingMethod: electricitySelect.value,
    waterBillingMethod: waterSelect.value,
    // Bỏ trống -> gửi null, KHÔNG BAO GIỜ gửi chuỗi rỗng "" (xem
    // docs/API.md mục "actualChargedAmount scale corrective" — "" không
    // phải một chuỗi thập phân hợp lệ).
    actualChargedAmount: actualRaw.length === 0 ? null : actualRaw,
  };

  const regionEl = document.querySelector<HTMLElement>("#invoice-result-region");
  setInvoiceSubmitDisabled(true);
  try {
    const result = await createInvoice(body);

    if (!result.success) {
      if (result.error.code === "INVOICE_ALREADY_EXISTS" && regionEl) {
        renderInvoiceAlreadyExistsPrompt(regionEl);
        document
          .querySelector<HTMLButtonElement>("#invoice-load-existing-btn")
          ?.addEventListener("click", () => void loadExistingInvoice());
      }
      showGlobalAlert("danger", result.error.message);
      return;
    }

    showGlobalAlert("success", "Đã tạo hóa đơn.");
    if (regionEl) {
      renderInvoiceResult(regionEl, result.data.invoice, result.data.items, result.data.billingDifference, selectedRoomLabel);
    }
  } finally {
    setInvoiceSubmitDisabled(false);
  }
}

async function loadExistingInvoice(): Promise<void> {
  const common = readInvoiceFormCommon();
  if (!common) return;

  const regionEl = document.querySelector<HTMLElement>("#invoice-result-region");
  if (!regionEl) return;
  renderLoading(regionEl);

  const result = await fetchInvoice(common.roomId, common.billingPeriod);
  if (!result.success) {
    if (result.error.code === "INVOICE_NOT_FOUND") {
      renderInvoiceNotFound(regionEl);
      return;
    }
    showGlobalAlert("danger", result.error.message);
    renderInvoiceNotFound(regionEl);
    return;
  }

  renderInvoiceResult(regionEl, result.data.invoice, result.data.items, result.data.billingDifference, selectedRoomLabel);
}
