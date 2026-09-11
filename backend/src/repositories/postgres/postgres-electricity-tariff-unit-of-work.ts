// SPDX-License-Identifier: MIT

import { Result } from "../../shared/result";
import { runInTransaction } from "../../database/transaction";
import { ElectricityTariffUnitOfWork } from "../electricity-tariff-unit-of-work";
import { ElectricityTariffRepository } from "../electricity-tariff.repository";
import { PostgresElectricityTariffRepository } from "./postgres-electricity-tariff.repository";

/** Implementation Postgres.js của `ElectricityTariffUnitOfWork` — cùng thiết kế với `postgres-invoice-unit-of-work.ts`. */
export class PostgresElectricityTariffUnitOfWork implements ElectricityTariffUnitOfWork {
  async run<T>(work: (repository: ElectricityTariffRepository) => Promise<Result<T>>): Promise<Result<T>> {
    return runInTransaction(async (tx) => {
      const repository = new PostgresElectricityTariffRepository(tx);
      return work(repository);
    });
  }
}
