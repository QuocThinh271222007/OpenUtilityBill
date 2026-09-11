// SPDX-License-Identifier: MIT

import { getDatabaseClient } from "../database/postgres-client";
import { PostgresPropertyRepository } from "../repositories/postgres/postgres-property.repository";
import { PropertyManagementService } from "../modules/property/property-management.service";

/**
 * Responsibility:
 * Composition root cho property module — lắp ráp
 * `PropertyManagementService` THẬT (Postgres). Cùng nguyên tắc LAZY với
 * `invoice.composition.ts`: `getDatabaseClient()` chỉ được gọi BÊN
 * TRONG hàm factory, KHÔNG ở top-level, để import module này (qua
 * `property.routes.ts` -> `app.ts`) không đụng tới database — giữ
 * `GET /api/v1/health` hoạt động không cần `DATABASE_URL`.
 */
export function getPropertyManagementService(): PropertyManagementService {
  const sql = getDatabaseClient();
  return new PropertyManagementService({ propertyRepository: new PostgresPropertyRepository(sql) });
}
