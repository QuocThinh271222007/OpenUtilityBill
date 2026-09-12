// SPDX-License-Identifier: MIT

import { getDatabaseClient } from "../database/postgres-client";
import { PostgresRoomRepository } from "../repositories/postgres/postgres-room.repository";
import { PostgresMeterReadingRepository } from "../repositories/postgres/postgres-meter-reading.repository";
import { PostgresElectricityTariffRepository } from "../repositories/postgres/postgres-electricity-tariff.repository";
import { PostgresWaterTariffRepository } from "../repositories/postgres/postgres-water-tariff.repository";
import { PostgresInvoiceRepository } from "../repositories/postgres/postgres-invoice.repository";
import { PostgresInvoiceUnitOfWork } from "../repositories/postgres/postgres-invoice-unit-of-work";
import { CreateInvoiceService } from "../modules/invoice/create-invoice.service";
import { GetInvoiceService } from "../modules/invoice/get-invoice.service";
import { DeleteInvoiceService } from "../modules/invoice/delete-invoice.service";

/**
 * Trách nhiệm:
 * "Composition root" cho invoice module — nơi DUY NHẤT lắp ráp
 * `CreateInvoiceService`/`GetInvoiceService` THẬT (Postgres) từ các
 * Repository/UnitOfWork Postgres cụ thể, để Route/Controller
 * (`../modules/invoice/invoice.routes.ts`) không phải tự `new` từng
 * Repository — giữ đúng ranh giới "Controller/Service không import
 * Postgres.js" (docs/ARCHITECTURE.md).
 *
 * Important invariant — LAZY, KHÔNG kết nối database khi import module:
 * `getDatabaseClient()` CHỈ được gọi BÊN TRONG mỗi hàm factory dưới
 * đây, KHÔNG ở top-level của file này. Nếu gọi ở top-level, chỉ IMPORT
 * file này (ví dụ vì `app.ts` mount `invoice.routes.ts`, vốn import
 * module này) đã đủ khiến `getDatabaseClient()` throw khi thiếu
 * `DATABASE_URL` — phá vỡ `GET /api/v1/health` (không cần database)
 * trong MỌI môi trường không có `DATABASE_URL`, kể cả chạy test không
 * đụng tới database (xem `backend/src/database/postgres-client.ts` mục
 * "Lý do tồn tại" — `getDatabaseClient()` fail-fast bằng
 * throw, không phải `Result`, đúng cho lỗi cấu hình khi khởi động,
 * nhưng SAI thời điểm nếu bị gọi chỉ vì import một route file).
 *
 * Không chịu trách nhiệm:
 * - chứa business logic hay SQL — chỉ lắp ráp (wiring).
 * - cache/singleton hoá Service instance — chi phí tạo lại vài
 *   Repository object mỗi request là không đáng kể so với một round-trip
 *   HTTP + database, và tránh phải tự quản lý vòng đời instance riêng.
 *   `getDatabaseClient()` bản thân NÓ đã cache client Postgres.js cấp
 *   ứng dụng — các factory dưới đây không tạo connection pool mới.
 */
export function getCreateInvoiceService(): CreateInvoiceService {
  const sql = getDatabaseClient();
  return new CreateInvoiceService({
    roomRepository: new PostgresRoomRepository(sql),
    invoiceRepository: new PostgresInvoiceRepository(sql),
    meterReadingRepository: new PostgresMeterReadingRepository(sql),
    electricityTariffRepository: new PostgresElectricityTariffRepository(sql),
    waterTariffRepository: new PostgresWaterTariffRepository(sql),
    invoiceUnitOfWork: new PostgresInvoiceUnitOfWork(),
  });
}

export function getGetInvoiceService(): GetInvoiceService {
  const sql = getDatabaseClient();
  return new GetInvoiceService({
    invoiceRepository: new PostgresInvoiceRepository(sql),
  });
}

export function getDeleteInvoiceService(): DeleteInvoiceService {
  const sql = getDatabaseClient();
  return new DeleteInvoiceService({
    invoiceRepository: new PostgresInvoiceRepository(sql),
  });
}
