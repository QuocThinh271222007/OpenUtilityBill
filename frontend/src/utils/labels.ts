// SPDX-License-Identifier: MIT

import type { ElectricityBillingMethod, WaterBillingMethod } from "../types/tariff.types";
import type { InvoiceItemCategory } from "../types/invoice.types";
import type { UtilityType } from "../types/meter-reading.types";

/**
 * Trách nhiệm:
 * Ánh xạ giá trị enum API (tiếng Anh, cố định, xem docs/API.md) sang
 * nhãn hiển thị tiếng Việt — TÁCH RIÊNG khỏi giá trị `option.value`
 * thực sự gửi lên API; giá trị enum thật không bao giờ đổi, chỉ nhãn
 * hiển thị là tiếng Việt.
 *
 * Không chịu trách nhiệm: tính toán gì — chỉ ánh xạ chuỗi hằng số sang chuỗi hằng số.
 */
export function electricityMethodDisplayLabel(method: ElectricityBillingMethod): string {
  return method === "QUOTA_TIERED" ? "Theo định mức số người / bậc thang" : "Chưa kê khai — toàn bộ sản lượng theo bậc fallback";
}

export function waterMethodDisplayLabel(method: WaterBillingMethod): string {
  return method === "PER_CUBIC_METER" ? "Theo m³" : "Theo số người";
}

export function utilityTypeDisplayLabel(utilityType: UtilityType): string {
  return utilityType === "ELECTRICITY" ? "Điện" : "Nước";
}

export function invoiceItemCategoryDisplayLabel(category: InvoiceItemCategory): string {
  switch (category) {
    case "ELECTRICITY_TIER":
      return "Tiền điện theo bậc";
    case "ELECTRICITY_VAT":
      return "VAT điện";
    case "WATER_BASE":
      return "Tiền nước";
    case "WATER_VAT":
      return "VAT nước";
    case "WATER_ENVIRONMENTAL_FEE":
      return "Phí môi trường nước";
  }
}
