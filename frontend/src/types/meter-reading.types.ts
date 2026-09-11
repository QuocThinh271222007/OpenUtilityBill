// SPDX-License-Identifier: MIT

/**
 * Responsibility:
 * Type mô tả `MeterReading` và body ghi dữ liệu — khớp
 * docs/MANAGEMENT_API.md mục "Meter readings".
 *
 * Important invariant:
 * `previousReading`/`currentReading`/`meterMaximumValue` LUÔN là
 * `string` (NUMERIC(12,2) ở backend) — KHÔNG BAO GIỜ ép về `number`,
 * kể cả để tính toán tạm thời (xem docs/FRONTEND.md mục "Financial
 * string rule").
 */
export type UtilityType = "ELECTRICITY" | "WATER";

export interface MeterReading {
  id: string;
  roomId: string;
  billingPeriod: string;
  utilityType: UtilityType;
  previousReading: string;
  currentReading: string;
  meterMaximumValue: string | null;
  createdAt: string;
}

/** Dùng cho cả POST (create) VÀ PUT (update, full replacement) — cùng hình dạng, xem docs/MANAGEMENT_API.md "PATCH vs. PUT". */
export interface MeterReadingBody {
  roomId: string;
  billingPeriod: string;
  utilityType: UtilityType;
  previousReading: string;
  currentReading: string;
  meterMaximumValue: string | null;
}
