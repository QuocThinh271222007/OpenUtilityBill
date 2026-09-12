// SPDX-License-Identifier: MIT

import { escapeHtml, isoDateToDisplayDate, formatVndDisplay, classifyBillingDifference } from "../utils/format";
import { electricityMethodDisplayLabel, invoiceItemCategoryDisplayLabel, unitNameDisplaySuffix, waterMethodDisplayLabel } from "../utils/labels";
import { pageIntroHtml, setButtonBusyState } from "./shared.view";
import type { Invoice, InvoiceItem, InvoiceItemCategory } from "../types/invoice.types";

/**
 * Trách nhiệm:
 * Render trang "Hóa đơn" — form tạo hóa đơn, và kết quả (hoá đơn vừa
 * tạo HOẶC hoá đơn đã lưu đọc lại qua GET, đối chiếu thực thu/hợp
 * pháp).
 *
 * Bất biến quan trọng:
 * MỌI số tiền hiển thị (`item.amount`, `invoice.calculatedTotal`,
 * `invoice.actualChargedAmount`, `billingDifference`) đến TRỰC TIẾP từ
 * API, KHÔNG được tính lại/suy ra bằng phép toán JS ở đây — xem
 * docs/FRONTEND.md mục "Quy tắc chuỗi tài chính (quan trọng)". Bảng breakdown dùng
 * NGUYÊN VĂN `item.amount`, KHÔNG dựng lại từ quantity × unitPrice.
 *
 * Không chịu trách nhiệm: gọi API, quyết định khi nào submit.
 */
export function renderInvoicePage(container: HTMLElement): void {
  container.innerHTML = `
    ${pageIntroHtml("Tạo và kiểm tra chi phí điện nước theo từng kỳ.")}
    <div class="card mb-4 app-form-card">
      <div class="card-header">Tạo hóa đơn</div>
      <div class="card-body">
        <form id="invoice-form" novalidate>
          <div class="row g-3">
            <div class="col-md-4">
              <label for="invoice-property-select" class="form-label">Cơ sở</label>
              <select class="form-select" id="invoice-property-select" required><option value="">-- Chọn cơ sở --</option></select>
            </div>
            <div class="col-md-4">
              <label for="invoice-room-select" class="form-label">Phòng</label>
              <select class="form-select" id="invoice-room-select" required disabled><option value="">-- Chọn phòng --</option></select>
            </div>
            <div class="col-md-4">
              <label for="invoice-month" class="form-label">Kỳ hóa đơn (tháng)</label>
              <input type="text" inputmode="numeric" class="form-control" id="invoice-month" placeholder="mm/yyyy" required />
            </div>
          </div>
          <div class="row g-3 mt-1">
            <div class="col-md-6">
              <label for="invoice-electricity-method" class="form-label">Phương pháp tính điện</label>
              <select class="form-select" id="invoice-electricity-method" required>
                <option value="QUOTA_TIERED">${escapeHtml(electricityMethodDisplayLabel("QUOTA_TIERED"))}</option>
                <option value="FALLBACK_TIER_FLAT">${escapeHtml(electricityMethodDisplayLabel("FALLBACK_TIER_FLAT"))}</option>
              </select>
            </div>
            <div class="col-md-6">
              <label for="invoice-water-method" class="form-label">Phương pháp tính nước</label>
              <select class="form-select" id="invoice-water-method" required>
                <option value="PER_CUBIC_METER">${escapeHtml(waterMethodDisplayLabel("PER_CUBIC_METER"))}</option>
                <option value="PER_PERSON">${escapeHtml(waterMethodDisplayLabel("PER_PERSON"))}</option>
              </select>
            </div>
          </div>
          <div class="row g-3 mt-1">
            <div class="col-md-6">
              <label for="invoice-actual-charged" class="form-label">Số tiền thực thu</label>
              <div class="input-group">
                <input type="text" inputmode="decimal" class="form-control" id="invoice-actual-charged" aria-describedby="invoice-actual-charged-help" />
                <span class="input-group-text">đ</span>
              </div>
              <div class="form-text" id="invoice-actual-charged-help">Để trống nếu chưa có số tiền thực thu.</div>
            </div>
          </div>
          <div class="d-flex flex-wrap gap-2 mt-3">
            <button type="submit" class="btn btn-primary" id="invoice-submit-btn">Tạo hóa đơn</button>
            <button type="button" class="btn btn-outline-secondary" id="invoice-view-existing-btn">Xem hóa đơn đã lưu</button>
          </div>
        </form>
      </div>
    </div>
    <div id="invoice-result-region"></div>
  `;
}

export function setInvoiceSubmitDisabled(disabled: boolean): void {
  const btn = document.querySelector<HTMLButtonElement>("#invoice-submit-btn");
  if (btn) setButtonBusyState(btn, disabled, "Đang tạo hóa đơn…");
}

function billingPeriodToMonthLabel(billingPeriod: string): string {
  return `Tháng ${billingPeriod.slice(5, 7)}/${billingPeriod.slice(0, 4)}`;
}

function itemDescriptionLabel(item: InvoiceItem): string {
  if (item.description) return item.description;
  if (item.category === "ELECTRICITY_TIER" && item.tierNumber !== null) return `Bậc điện ${item.tierNumber}`;
  return invoiceItemCategoryDisplayLabel(item.category);
}

function itemRowHtml(item: InvoiceItem): string {
  const unitSuffix = unitNameDisplaySuffix(item.unitName);
  const unitPriceDisplay = item.unitPrice !== null ? `${formatVndDisplay(item.unitPrice)}${unitSuffix ? `/${unitSuffix}` : ""}` : "—";
  return `
    <tr>
      <td>${escapeHtml(itemDescriptionLabel(item))}</td>
      <td class="app-numeric">${item.quantity !== null ? escapeHtml(item.quantity) : "—"}</td>
      <td>${unitSuffix !== null ? escapeHtml(unitSuffix) : "—"}</td>
      <td class="app-numeric">${escapeHtml(unitPriceDisplay)}</td>
      <td class="app-numeric">${escapeHtml(formatVndDisplay(item.amount))}</td>
    </tr>
  `;
}

const ELECTRICITY_CATEGORIES: readonly InvoiceItemCategory[] = ["ELECTRICITY_TIER", "ELECTRICITY_VAT"];
const WATER_CATEGORIES: readonly InvoiceItemCategory[] = ["WATER_BASE", "WATER_VAT", "WATER_ENVIRONMENTAL_FEE"];

/**
 * Nhóm các dòng breakdown theo điện/nước ĐỂ HIỂN THỊ trong hai khối
 * riêng (xem `renderInvoiceResult`) — CHỈ lọc theo `category`, KHÔNG
 * cộng dồn `amount` thành một dòng "tổng phụ" mới: backend không trả
 * sẵn tổng phụ theo từng loại tiện ích, và cộng số tiền ở đây sẽ là một
 * phép tính tài chính trên frontend (bị cấm — xem bất biến ở đầu file).
 * "Tổng hợp pháp" hiển thị bên dưới vẫn LUÔN là `invoice.calculatedTotal`
 * nguyên văn từ backend.
 */
function itemsSectionHtml(title: string, items: InvoiceItem[]): string {
  if (items.length === 0) return "";
  const rows = items.map(itemRowHtml).join("");
  return `
    <div class="card mb-3 app-invoice-section">
      <div class="card-header">${escapeHtml(title)}</div>
      <div class="card-body">
        <div class="table-responsive">
          <table class="table table-bordered align-middle mb-0 app-table">
            <thead><tr><th>Nội dung</th><th class="app-numeric">Số lượng</th><th>Đơn vị</th><th class="app-numeric">Đơn giá</th><th class="app-numeric">Thành tiền</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function differenceBlockHtml(invoice: Invoice, billingDifference: string): string {
  const status = classifyBillingDifference(billingDifference);
  const statusLabel =
    status === "over"
      ? "Thu cao hơn mức tính hợp pháp"
      : status === "under"
        ? "Thu thấp hơn mức tính hợp pháp"
        : "Khớp với mức tính hợp pháp";
  const badgeClass = status === "over" ? "text-bg-warning" : status === "under" ? "text-bg-danger" : "text-bg-success";
  const actualChargedDisplay = invoice.actualChargedAmount !== null ? formatVndDisplay(invoice.actualChargedAmount) : "—";

  return `
    <div class="card app-invoice-difference" data-diff-status="${status}">
      <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
        <span>Đối chiếu thực thu / hợp pháp</span>
        <span class="badge ${badgeClass}">${escapeHtml(statusLabel)}</span>
      </div>
      <div class="card-body">
        <dl class="row mb-0">
          <dt class="col-sm-5">Số tiền thực thu</dt><dd class="col-sm-7 app-numeric">${escapeHtml(actualChargedDisplay)}</dd>
          <dt class="col-sm-5">Số tiền hợp pháp</dt><dd class="col-sm-7 app-numeric">${escapeHtml(formatVndDisplay(invoice.calculatedTotal))}</dd>
          <dt class="col-sm-5">Chênh lệch</dt><dd class="col-sm-7 app-numeric">${escapeHtml(formatVndDisplay(billingDifference))}</dd>
        </dl>
      </div>
    </div>
  `;
}

export function renderInvoiceResult(
  regionEl: HTMLElement,
  invoice: Invoice,
  items: InvoiceItem[],
  billingDifference: string | null,
  roomLabel: string
): void {
  const electricityItems = items.filter((item) => ELECTRICITY_CATEGORIES.includes(item.category));
  const waterItems = items.filter((item) => WATER_CATEGORIES.includes(item.category));
  const differenceHtml = billingDifference !== null ? differenceBlockHtml(invoice, billingDifference) : "";

  regionEl.innerHTML = `
    <div class="card app-invoice-summary mb-4">
      <div class="card-header">Hóa đơn — ${escapeHtml(roomLabel)}</div>
      <div class="card-body">
        <dl class="row mb-0">
          <dt class="col-sm-4">Kỳ hóa đơn</dt><dd class="col-sm-8">${escapeHtml(billingPeriodToMonthLabel(invoice.billingPeriod))} (${escapeHtml(isoDateToDisplayDate(invoice.billingPeriod))})</dd>
          <dt class="col-sm-4">Số người dùng để tính</dt><dd class="col-sm-8">${invoice.tenantCountUsed}</dd>
          <dt class="col-sm-4">Phương pháp tính điện</dt><dd class="col-sm-8">${escapeHtml(electricityMethodDisplayLabel(invoice.electricityBillingMethod))}</dd>
          <dt class="col-sm-4">Phương pháp tính nước</dt><dd class="col-sm-8">${escapeHtml(waterMethodDisplayLabel(invoice.waterBillingMethod))}</dd>
        </dl>
      </div>
    </div>

    ${itemsSectionHtml("Chi phí điện", electricityItems)}
    ${itemsSectionHtml("Chi phí nước", waterItems)}

    <div class="card app-invoice-total mb-4">
      <div class="card-body d-flex justify-content-between align-items-center flex-wrap gap-2">
        <span class="fs-5">Tổng hợp pháp</span>
        <span class="fs-4 fw-bold app-numeric">${escapeHtml(formatVndDisplay(invoice.calculatedTotal))}</span>
      </div>
    </div>

    ${differenceHtml}
  `;
}

export function renderInvoiceAlreadyExistsPrompt(regionEl: HTMLElement): void {
  regionEl.innerHTML = `
    <div class="alert alert-warning d-flex flex-wrap justify-content-between align-items-center gap-2">
      <span>Hóa đơn cho phòng và kỳ này đã tồn tại.</span>
      <button type="button" class="btn btn-sm btn-primary" id="invoice-load-existing-btn">
        Xem hóa đơn đã lưu
      </button>
    </div>
  `;
}

export function renderInvoiceNotFound(regionEl: HTMLElement): void {
  regionEl.innerHTML = `<div class="alert alert-secondary">Chưa có hóa đơn cho phòng và kỳ này.</div>`;
}
