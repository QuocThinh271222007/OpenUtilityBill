// SPDX-License-Identifier: MIT

import type { ElectricityBillingMethod, WaterBillingMethod } from "./tariff.types";

/**
 * Trách nhiệm:
 * Type mô tả `Invoice`/`InvoiceItem` và kết quả tính toán trả về từ
 * `POST`/`GET /api/v1/invoices` — khớp docs/API.md.
 *
 * Bất biến quan trọng:
 * `calculatedTotal`/`actualChargedAmount`/`amount`/`unitPrice`/
 * `quantity`/`billingDifference`/mọi field trong `electricity`/`water`/
 * `invoiceTotal` LUÔN là `string` — KHÔNG BAO GIỜ ép về `number` để
 * tính toán (frontend chỉ hiển thị, backend là nguồn sự thật duy nhất
 * — xem docs/FRONTEND.md mục "Quy tắc chuỗi tài chính (quan trọng)").
 *
 * Không chịu trách nhiệm:
 * - định nghĩa lại toàn bộ hình dạng `TieredElectricityResult`/
 *   `FallbackElectricityResult`/`WaterChargeResult` một cách tách biệt
 *   khỏi những gì UI thực sự hiển thị — chỉ giữ field UI cần đọc.
 */
export type InvoiceItemCategory = "ELECTRICITY_TIER" | "ELECTRICITY_VAT" | "WATER_BASE" | "WATER_VAT" | "WATER_ENVIRONMENTAL_FEE";

export interface Invoice {
  id: string;
  roomId: string;
  billingPeriod: string;
  tenantCountUsed: number;
  electricityTariffId: string;
  waterTariffId: string;
  electricityBillingMethod: ElectricityBillingMethod;
  waterBillingMethod: WaterBillingMethod;
  electricityReadingId: string;
  waterReadingId: string | null;
  calculatedTotal: string;
  actualChargedAmount: string | null;
  createdAt: string;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  category: InvoiceItemCategory;
  tierNumber: number | null;
  quantity: string | null;
  unitName: string | null;
  unitPrice: string | null;
  amount: string;
  description: string | null;
  displayOrder: number;
}

export interface CreateInvoiceBody {
  roomId: string;
  billingPeriod: string;
  electricityBillingMethod: string;
  waterBillingMethod: string;
  actualChargedAmount: string | null;
}

export interface CreateInvoiceResult {
  invoice: Invoice;
  items: InvoiceItem[];
  billingDifference: string | null;
}

export interface GetInvoiceResult {
  invoice: Invoice;
  items: InvoiceItem[];
  billingDifference: string | null;
}
