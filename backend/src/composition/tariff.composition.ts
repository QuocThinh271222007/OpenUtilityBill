// SPDX-License-Identifier: MIT

import { getDatabaseClient } from "../database/postgres-client";
import { PostgresElectricityTariffRepository } from "../repositories/postgres/postgres-electricity-tariff.repository";
import { PostgresElectricityTariffUnitOfWork } from "../repositories/postgres/postgres-electricity-tariff-unit-of-work";
import { PostgresWaterTariffRepository } from "../repositories/postgres/postgres-water-tariff.repository";
import { ElectricityTariffManagementService } from "../modules/tariff/electricity-tariff-management.service";
import { WaterTariffManagementService } from "../modules/tariff/water-tariff-management.service";

/** Composition root cho tariff module (electricity + water) — cùng nguyên tắc LAZY với các composition root khác. */
export function getElectricityTariffManagementService(): ElectricityTariffManagementService {
  const sql = getDatabaseClient();
  return new ElectricityTariffManagementService({
    electricityTariffRepository: new PostgresElectricityTariffRepository(sql),
    electricityTariffUnitOfWork: new PostgresElectricityTariffUnitOfWork(),
  });
}

export function getWaterTariffManagementService(): WaterTariffManagementService {
  const sql = getDatabaseClient();
  return new WaterTariffManagementService({ waterTariffRepository: new PostgresWaterTariffRepository(sql) });
}
