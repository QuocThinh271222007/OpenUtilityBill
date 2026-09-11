// SPDX-License-Identifier: MIT

/**
 * Chỉ (id, effectiveFrom, effectiveTo) của MỘT tariff — đủ cho kiểm tra
 * chồng lấn khoảng hiệu lực, DÙNG CHUNG bởi `ElectricityTariffRepository`
 * và `WaterTariffRepository` (hai bảng độc lập, cùng hình dạng thông
 * tin cần cho việc này).
 */
export interface TariffEffectivePeriod {
  id: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}
