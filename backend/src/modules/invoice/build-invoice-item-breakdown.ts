// SPDX-License-Identifier: MIT

import { NewInvoiceItem } from "../../repositories/invoice.repository";
import { ElectricityBillingMethod } from "../tariff/tariff.model";
import {
  FallbackElectricityResult,
  TieredElectricityResult,
  WaterChargeResult,
} from "../../calculation/types/calculation.types";

/**
 * Trách nhiệm:
 * Xây dựng danh sách `NewInvoiceItem[]` (breakdown giải thích hoá đơn)
 * từ kết quả ĐÃ TÍNH của Calculation Core — hàm THUẦN TUÝ (pure), không
 * tự tính toán tiền, không truy cập database.
 *
 * Input: kết quả điện (`TieredElectricityResult` hoặc
 * `FallbackElectricityResult`, tuỳ `electricityBillingMethod`), kết quả
 * nước (`WaterChargeResult`), cùng phần dữ liệu hiển thị mà
 * `WaterChargeResult` không tự chứa (số lượng/đơn giá nước — xem "Why
 * waterQuantity/waterUnitPrice là tham số riêng" bên dưới).
 *
 * Output: `NewInvoiceItem[]`, `displayOrder` tăng dần bắt đầu từ 1, xác
 * định (deterministic) — thứ tự: dòng (các) bậc điện, VAT điện, nước
 * (base), VAT nước, phí môi trường nước.
 *
 * Bất biến quan trọng:
 * Mọi `amount`/`quantity`/`unitPrice` được COPY NGUYÊN VĂN từ kết quả
 * Calculation Core — KHÔNG làm tròn thêm ở đây. Migration 002 nới rộng
 * `invoice_items.quantity`/`.amount` thành NUMERIC không giới hạn scale
 * chính là để giữ đúng các giá trị chính xác này (xem
 * docs/NUMERIC_PRECISION.md).
 *
 * Why waterQuantity/waterUnitPrice là tham số riêng (không đọc từ
 * WaterChargeResult):
 * `WaterChargeResult` (calculation.types.ts) không lưu lại usage m3 hay
 * đơn giá đã dùng — nó chỉ trả `base`/`vatAmount`/`environmentalFeeAmount`.
 * Caller (CreateInvoiceService) đã có sẵn các giá trị này (từ meter
 * reading đã tính usage, hoặc từ tariff), nên truyền thẳng vào thay vì
 * hàm này tự suy luận lại từ `method`.
 *
 * Không chịu trách nhiệm:
 * - tự quyết định QUOTA_TIERED hay FALLBACK_TIER_FLAT — nhận
 *   `electricityBillingMethod` làm tham số để biết cách đọc
 *   `electricity` (union type, không tự đoán qua field nào có mặt).
 * - validate lại số liệu — dữ liệu đầu vào được giả định ĐÃ hợp lệ (đã
 *   qua Calculation Core, vốn tự validate — xem "Không chịu trách nhiệm" của từng hàm
 *   calculate*).
 */
export interface BuildInvoiceItemBreakdownInput {
  electricityBillingMethod: ElectricityBillingMethod;
  electricity: TieredElectricityResult | FallbackElectricityResult;
  water: WaterChargeResult;
  waterQuantity: string;
  waterUnitName: "m3" | "person";
  waterUnitPrice: string;
}

export function buildInvoiceItemBreakdown(input: BuildInvoiceItemBreakdownInput): NewInvoiceItem[] {
  const items: NewInvoiceItem[] = [];
  let displayOrder = 1;

  if (input.electricityBillingMethod === "QUOTA_TIERED") {
    const tiered = input.electricity as TieredElectricityResult;
    for (const tier of tiered.appliedTiers) {
      items.push({
        category: "ELECTRICITY_TIER",
        tierNumber: tier.tierNumber,
        quantity: tier.quantityKwh,
        unitName: "kWh",
        unitPrice: tier.unitPrice,
        amount: tier.amount,
        description: `Bậc điện ${tier.tierNumber}`,
        displayOrder: displayOrder++,
      });
    }
    items.push({
      category: "ELECTRICITY_VAT",
      tierNumber: null,
      quantity: null,
      unitName: null,
      unitPrice: null,
      amount: tiered.vatAmount,
      description: "VAT điện",
      displayOrder: displayOrder++,
    });
  } else {
    const fallback = input.electricity as FallbackElectricityResult;
    items.push({
      category: "ELECTRICITY_TIER",
      tierNumber: fallback.fallbackTierNumber,
      quantity: fallback.usageKwh,
      unitName: "kWh",
      unitPrice: fallback.unitPrice,
      amount: fallback.subtotal,
      description: `Toàn bộ sản lượng tính theo bậc fallback ${fallback.fallbackTierNumber}`,
      displayOrder: displayOrder++,
    });
    items.push({
      category: "ELECTRICITY_VAT",
      tierNumber: null,
      quantity: null,
      unitName: null,
      unitPrice: null,
      amount: fallback.vatAmount,
      description: "VAT điện",
      displayOrder: displayOrder++,
    });
  }

  items.push({
    category: "WATER_BASE",
    tierNumber: null,
    quantity: input.waterQuantity,
    unitName: input.waterUnitName,
    unitPrice: input.waterUnitPrice,
    amount: input.water.base,
    description: input.waterUnitName === "m3" ? "Nước theo m3" : "Nước theo số người",
    displayOrder: displayOrder++,
  });
  items.push({
    category: "WATER_VAT",
    tierNumber: null,
    quantity: null,
    unitName: null,
    unitPrice: null,
    amount: input.water.vatAmount,
    description: "VAT nước",
    displayOrder: displayOrder++,
  });
  items.push({
    category: "WATER_ENVIRONMENTAL_FEE",
    tierNumber: null,
    quantity: null,
    unitName: null,
    unitPrice: null,
    amount: input.water.environmentalFeeAmount,
    description: "Phí môi trường nước",
    displayOrder: displayOrder++,
  });

  return items;
}
