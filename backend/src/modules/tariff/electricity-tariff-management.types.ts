// SPDX-License-Identifier: MIT

import { ElectricityTariffRepository, ElectricityTariffWithTiers } from "../../repositories/electricity-tariff.repository";
import { ElectricityTariffUnitOfWork } from "../../repositories/electricity-tariff-unit-of-work";

export interface ElectricityTariffTierInput {
  tierNumber: number;
  thresholdKwh: string | null;
  unitPrice: string;
}

/** POST — mọi field bắt buộc, `tiers` phải KHÔNG rỗng (kiểm tra ở Calculation Core `validateElectricityConfig`). */
export interface CreateElectricityTariffInput {
  name: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  electricityVatRate: string;
  peoplePerQuotaUnit: number;
  fallbackTierNumber: number;
  tiers: ElectricityTariffTierInput[];
}

/** PUT — THAY THẾ TOÀN BỘ (parent + tiers), cùng hình dạng với create. */
export type UpdateElectricityTariffInput = CreateElectricityTariffInput;

/**
 * `electricityTariffRepository` dùng cho các thao tác ĐỌC (list,
 * listEffectivePeriods, isReferencedByInvoice) — luôn chạy NGOÀI
 * transaction, giống cách `CreateInvoiceService` dùng `invoiceRepository`
 * chỉ cho pre-check `findByRoomAndPeriod`. Thao tác GHI (createTariff/
 * replaceTiers/updateTariffParent) luôn đi qua
 * `electricityTariffUnitOfWork`, KHÔNG BAO GIỜ gọi trực tiếp qua field
 * này.
 */
export interface ElectricityTariffManagementDependencies {
  electricityTariffRepository: ElectricityTariffRepository;
  electricityTariffUnitOfWork: ElectricityTariffUnitOfWork;
}

export type { ElectricityTariffWithTiers };
