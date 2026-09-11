// SPDX-License-Identifier: MIT

import { getDatabaseClient } from "../database/postgres-client";
import { PostgresMeterReadingRepository } from "../repositories/postgres/postgres-meter-reading.repository";
import { MeterReadingManagementService } from "../modules/meter-reading/meter-reading-management.service";

/** Composition root cho meter-reading module — cùng nguyên tắc LAZY với các composition root khác. */
export function getMeterReadingManagementService(): MeterReadingManagementService {
  const sql = getDatabaseClient();
  return new MeterReadingManagementService({ meterReadingRepository: new PostgresMeterReadingRepository(sql) });
}
