// SPDX-License-Identifier: MIT

import { ElectricityTierInput } from "../../types/calculation.types";

/**
 * Trách nhiệm:
 * Cung cấp dữ liệu cấu hình MẶC ĐỊNH (electricity_vat_rate,
 * people_per_quota_unit, fallback_tier_number, 6 bậc giá điện, cấu hình
 * nước) — CHỈ dùng để test, khớp với
 * database/seeds/001_default_tariffs.sql.
 *
 * Không chịu trách nhiệm:
 * - được import bởi bất kỳ module NÀO trong backend/src/calculation/
 *   ngoài __tests__/. Các hằng số ở đây (1984, 0.08, 8500, ...) TUYỆT
 *   ĐỐI KHÔNG được xuất hiện trong Calculation Core sản xuất — fixture
 *   này tồn tại để kiểm chứng đúng điều đó: Calculation Core CHỈ nhận
 *   các giá trị này qua tham số hàm, không bao giờ hard-code chúng (xem
 *   docs/CALCULATION_CORE.md mục "Cấu hình hoá, không hard-code").
 *
 * Lý do tồn tại (chỉ dùng cho test):
 * Tách biệt "dữ liệu cấu hình hiện tại" khỏi "công thức tính toán
 * tổng quát" — nếu biểu giá thay đổi, chỉ file test fixture này (và
 * database/seeds/001_default_tariffs.sql) cần cập nhật, không phải
 * bất kỳ file .ts nào trong backend/src/calculation/{electricity,water,...}.
 */

export const DEFAULT_ELECTRICITY_VAT_RATE = "0.08";
export const DEFAULT_PEOPLE_PER_QUOTA_UNIT = 4;
export const DEFAULT_FALLBACK_TIER_NUMBER = 3;

export const DEFAULT_ELECTRICITY_TIERS: ElectricityTierInput[] = [
  { tierNumber: 1, thresholdKwh: "50", unitPrice: "1984" },
  { tierNumber: 2, thresholdKwh: "50", unitPrice: "2050" },
  { tierNumber: 3, thresholdKwh: "100", unitPrice: "2380" },
  { tierNumber: 4, thresholdKwh: "100", unitPrice: "2998" },
  { tierNumber: 5, thresholdKwh: "100", unitPrice: "3350" },
  { tierNumber: 6, thresholdKwh: null, unitPrice: "3460" },
];

export const DEFAULT_WATER_PRICE_PER_CUBIC_METER = "8500";
export const DEFAULT_WATER_PRICE_PER_PERSON = "80000";
export const DEFAULT_WATER_VAT_RATE = "0.05";
export const DEFAULT_WATER_ENVIRONMENTAL_FEE_RATE = "0.10";
