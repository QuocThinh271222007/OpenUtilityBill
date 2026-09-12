// SPDX-License-Identifier: MIT

/**
 * Trách nhiệm:
 * Type mô tả cấu hình biểu giá điện/nước và body ghi dữ liệu — khớp
 * docs/MANAGEMENT_API.md mục "Electricity tariffs"/"Water tariffs".
 *
 * Bất biến quan trọng:
 * `electricityVatRate`/`thresholdKwh`/`unitPrice`/`pricePerCubicMeter`/
 * `pricePerPerson`/`vatRate`/`environmentalFeeRate` LUÔN là `string`
 * (NUMERIC ở backend). `peoplePerQuotaUnit`/`fallbackTierNumber`/
 * `tierNumber` là `number` (INTEGER ở backend, không phải NUMERIC tài
 * chính) — xem docs/FRONTEND.md mục "Integer vs. financial decimal
 * fields".
 *
 * `effectiveFrom`/`effectiveTo` dùng CÙNG hình dạng "YYYY-MM-DD" với
 * `billingPeriod`, nhưng KHÔNG bắt buộc ngày 01 — xem
 * docs/MANAGEMENT_API.md mục "Ngày hiệu lực tariff — quy tắc ngày khác
 * với billingPeriod".
 */
export type ElectricityBillingMethod = "QUOTA_TIERED" | "FALLBACK_TIER_FLAT";
export type WaterBillingMethod = "PER_CUBIC_METER" | "PER_PERSON";

export interface ElectricityTariff {
  id: string;
  name: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  electricityVatRate: string;
  peoplePerQuotaUnit: number;
  fallbackTierNumber: number;
  createdAt: string;
}

export interface ElectricityTariffTier {
  id: string;
  tariffId: string;
  tierNumber: number;
  thresholdKwh: string | null;
  unitPrice: string;
}

export interface ElectricityTariffWithTiers {
  tariff: ElectricityTariff;
  tiers: ElectricityTariffTier[];
}

export interface ElectricityTariffTierInput {
  tierNumber: number;
  thresholdKwh: string | null;
  unitPrice: string;
}

/** Dùng cho cả POST VÀ PUT (full replacement, cha + toàn bộ tiers) — xem docs/MANAGEMENT_API.md "Electricity tariff aggregate transaction". */
export interface ElectricityTariffBody {
  name: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  electricityVatRate: string;
  peoplePerQuotaUnit: number;
  fallbackTierNumber: number;
  tiers: ElectricityTariffTierInput[];
}

export interface WaterTariff {
  id: string;
  name: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  pricePerCubicMeter: string;
  pricePerPerson: string;
  vatRate: string;
  environmentalFeeRate: string;
  createdAt: string;
}

export interface WaterTariffBody {
  name: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  pricePerCubicMeter: string;
  pricePerPerson: string;
  vatRate: string;
  environmentalFeeRate: string;
}
