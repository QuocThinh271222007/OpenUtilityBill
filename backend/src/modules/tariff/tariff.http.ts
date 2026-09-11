// SPDX-License-Identifier: MIT

import { formatDateAsWireDate } from "../../shared/http/date-wire-format";
import { ElectricityTariff, ElectricityTariffTier, WaterTariff } from "./tariff.model";
import { ElectricityTariffWithTiers } from "../../repositories/electricity-tariff.repository";

/**
 * Trách nhiệm:
 * Tiện ích ranh giới HTTP CHỈ cho module tariff — chuyển
 * ElectricityTariff/ElectricityTariffTier/WaterTariff thành JSON an
 * toàn cho response. `effectiveFrom`/`effectiveTo` dùng
 * `formatDateAsWireDate` giống `billingPeriod` — CÙNG hình dạng
 * "YYYY-MM-DD" ở response, dù việc PARSE ở request có khác (tariff cho
 * phép bất kỳ ngày nào, không bắt buộc ngày 01 — xem `tariff.controller.ts`).
 */
export function serializeElectricityTariffTier(tier: ElectricityTariffTier) {
  return {
    id: tier.id,
    tariffId: tier.tariffId,
    tierNumber: tier.tierNumber,
    thresholdKwh: tier.thresholdKwh,
    unitPrice: tier.unitPrice,
  };
}

export function serializeElectricityTariff(tariff: ElectricityTariff) {
  return {
    id: tariff.id,
    name: tariff.name,
    effectiveFrom: formatDateAsWireDate(tariff.effectiveFrom),
    effectiveTo: tariff.effectiveTo === null ? null : formatDateAsWireDate(tariff.effectiveTo),
    electricityVatRate: tariff.electricityVatRate,
    peoplePerQuotaUnit: tariff.peoplePerQuotaUnit,
    fallbackTierNumber: tariff.fallbackTierNumber,
    createdAt: tariff.createdAt.toISOString(),
  };
}

export function serializeElectricityTariffWithTiers(data: ElectricityTariffWithTiers) {
  return { tariff: serializeElectricityTariff(data.tariff), tiers: data.tiers.map(serializeElectricityTariffTier) };
}

export function serializeWaterTariff(tariff: WaterTariff) {
  return {
    id: tariff.id,
    name: tariff.name,
    effectiveFrom: formatDateAsWireDate(tariff.effectiveFrom),
    effectiveTo: tariff.effectiveTo === null ? null : formatDateAsWireDate(tariff.effectiveTo),
    pricePerCubicMeter: tariff.pricePerCubicMeter,
    pricePerPerson: tariff.pricePerPerson,
    vatRate: tariff.vatRate,
    environmentalFeeRate: tariff.environmentalFeeRate,
    createdAt: tariff.createdAt.toISOString(),
  };
}
