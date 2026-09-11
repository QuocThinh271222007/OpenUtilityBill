// SPDX-License-Identifier: MIT

import { WaterTariffRepository } from "../../repositories/water-tariff.repository";

/** POST — mọi field bắt buộc. */
export interface CreateWaterTariffInput {
  name: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  pricePerCubicMeter: string;
  pricePerPerson: string;
  vatRate: string;
  environmentalFeeRate: string;
}

/** PUT — THAY THẾ TOÀN BỘ, cùng hình dạng với create. */
export type UpdateWaterTariffInput = CreateWaterTariffInput;

export interface WaterTariffManagementDependencies {
  waterTariffRepository: WaterTariffRepository;
}
