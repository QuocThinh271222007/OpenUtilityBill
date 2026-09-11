// SPDX-License-Identifier: MIT

import { Result } from "../shared/result";
import { ElectricityTariffRepository } from "./electricity-tariff.repository";

/**
 * Responsibility:
 * Trừu tượng hoá "chạy các thao tác ghi ElectricityTariffRepository
 * trong MỘT transaction" — cùng thiết kế NHỎ với
 * `invoice-unit-of-work.ts` (một interface, một phương thức `run`).
 * `ElectricityTariffManagementService` phụ thuộc interface này, KHÔNG
 * import Postgres.js/`DatabaseExecutor`/`runInTransaction` trực tiếp.
 *
 * Why this exists:
 * `electricity_tariffs` (cha) và `electricity_tariff_tiers` (con) PHẢI
 * được tạo/thay thế NGUYÊN TỬ — một tariff có cha đã ghi nhưng tier chỉ
 * ghi được một nửa không phải một cấu hình hợp lệ (xem
 * docs/MANAGEMENT_API.md mục "Electricity tariff aggregate transaction").
 *
 * Does NOT:
 * - biết gì về Postgres.js/SQL — implementation cụ thể nằm ở
 *   `postgres/postgres-electricity-tariff-unit-of-work.ts`.
 * - là một Unit-of-Work framework tổng quát (không hỗ trợ nhiều loại
 *   repository khác nhau trong cùng work, không hỗ trợ nested
 *   transaction) — tariff aggregate write là nhu cầu DUY NHẤT hiện có.
 */
export interface ElectricityTariffUnitOfWork {
  run<T>(work: (repository: ElectricityTariffRepository) => Promise<Result<T>>): Promise<Result<T>>;
}
