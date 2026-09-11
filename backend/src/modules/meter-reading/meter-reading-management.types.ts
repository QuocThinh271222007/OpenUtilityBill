// SPDX-License-Identifier: MIT

import { UtilityType } from "./meter-reading.model";
import { MeterReadingRepository } from "../../repositories/meter-reading.repository";

/** POST — tất cả field bắt buộc (`meterMaximumValue` có thể là `null`). */
export interface CreateMeterReadingInput {
  roomId: string;
  billingPeriod: Date;
  utilityType: string;
  previousReading: string;
  currentReading: string;
  meterMaximumValue: string | null;
}

/** PUT — THAY THẾ TOÀN BỘ, cùng hình dạng với create (xem `UpdateMeterReading`, meter-reading.repository.ts). */
export type UpdateMeterReadingInput = CreateMeterReadingInput;

export interface MeterReadingManagementDependencies {
  meterReadingRepository: MeterReadingRepository;
}

export type { UtilityType };
