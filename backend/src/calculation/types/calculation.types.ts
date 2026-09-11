// SPDX-License-Identifier: MIT

/**
 * Responsibility:
 * Khai báo các type dữ liệu dùng chung giữa nhiều module tính toán
 * (electricity, water) — hình dạng input/output của Calculation Core.
 *
 * Does NOT:
 * - import type từ backend/src/modules/* (domain model của tầng
 *   database). Calculation Core cố tình có bộ type RIÊNG, độc lập với
 *   domain model, dù hai bên mô tả khái niệm tương tự — để Calculation
 *   Core không phụ thuộc vào quyết định của tầng schema/database và có
 *   thể test/tái sử dụng hoàn toàn tách biệt (xem docs/CALCULATION_CORE.md).
 * - chứa hằng số biểu giá nào (không có 1984, 0.08, ...). Mọi giá trị
 *   đều là type, không phải data.
 *
 * Numeric contract:
 * Mọi field đo lường/tài chính (kWh, m3, giá, tỉ lệ) là `string` —
 * chuỗi thập phân chuẩn hoá — không bao giờ `number` hay BigInt. Xem
 * shared/exact-number.ts và docs/NUMERIC_PRECISION.md.
 */

export type ElectricityBillingMethod = "QUOTA_TIERED" | "FALLBACK_TIER_FLAT";

export type WaterBillingMethod = "PER_CUBIC_METER" | "PER_PERSON";

/** Một bậc giá điện, đúng như cấu hình đầu vào (chưa qua validate/parse). */
export interface ElectricityTierInput {
  tierNumber: number;
  /** null = bậc cuối, không giới hạn ("phần sản lượng còn lại"). */
  thresholdKwh: string | null;
  unitPrice: string;
}

/** Một bậc đã thực sự được áp dụng trong kết quả phân bổ. */
export interface AppliedElectricityTier {
  tierNumber: number;
  quantityKwh: string;
  unitPrice: string;
  amount: string;
}

export interface TieredElectricityResult {
  usageKwh: string;
  quotaFactor: string;
  appliedTiers: AppliedElectricityTier[];
  subtotal: string;
  vatRate: string;
  vatAmount: string;
  exactTotal: string;
  roundedTotalVnd: string;
}

export interface FallbackElectricityResult {
  usageKwh: string;
  fallbackTierNumber: number;
  unitPrice: string;
  subtotal: string;
  vatRate: string;
  vatAmount: string;
  exactTotal: string;
  roundedTotalVnd: string;
}

export interface WaterChargeResult {
  method: WaterBillingMethod;
  base: string;
  vatRate: string;
  vatAmount: string;
  environmentalFeeRate: string;
  environmentalFeeAmount: string;
  exactTotal: string;
  roundedTotalVnd: string;
}
