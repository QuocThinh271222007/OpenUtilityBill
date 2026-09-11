// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../shared/result";
import { logDatabaseError } from "../../database/postgres-client";
import type { DatabaseExecutor } from "../../database/database.types";
import { ElectricityBillingMethod, WaterBillingMethod } from "../../modules/tariff/tariff.model";
import { Invoice } from "../../modules/invoice/invoice.model";
import { InvoiceRepository } from "../invoice.repository";

/**
 * Responsibility:
 * Implementation Postgres.js của `InvoiceRepository` — nơi DUY NHẤT
 * chứa SQL truy vấn bảng `invoices` ở task này.
 *
 * Does NOT:
 * - implement bất kỳ thao tác ghi nào (insert invoice/invoice_items) —
 *   xem `../invoice.repository.ts` mục "Does NOT" và
 *   docs/DATABASE_ACCESS.md mục "Deliberately deferred".
 * - fail với NOT_FOUND khi không có invoice — xem giải thích trong
 *   `../invoice.repository.ts`.
 */
interface InvoiceRow {
  id: string;
  room_id: string;
  billing_period: Date;
  tenant_count_used: number;
  electricity_tariff_id: string;
  water_tariff_id: string;
  electricity_billing_method: ElectricityBillingMethod;
  water_billing_method: WaterBillingMethod;
  electricity_reading_id: string;
  water_reading_id: string | null;
  calculated_total: string;
  actual_charged_amount: string | null;
  created_at: Date;
}

function mapInvoiceRow(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    roomId: row.room_id,
    billingPeriod: row.billing_period,
    tenantCountUsed: row.tenant_count_used,
    electricityTariffId: row.electricity_tariff_id,
    waterTariffId: row.water_tariff_id,
    electricityBillingMethod: row.electricity_billing_method,
    waterBillingMethod: row.water_billing_method,
    electricityReadingId: row.electricity_reading_id,
    waterReadingId: row.water_reading_id,
    calculatedTotal: row.calculated_total,
    actualChargedAmount: row.actual_charged_amount,
    createdAt: row.created_at,
  };
}

export class PostgresInvoiceRepository implements InvoiceRepository {
  constructor(private readonly sql: DatabaseExecutor) {}

  async findByRoomAndPeriod(roomId: string, billingPeriod: Date): Promise<Result<Invoice | null>> {
    try {
      const rows = await this.sql<InvoiceRow[]>`
        SELECT id, room_id, billing_period, tenant_count_used,
               electricity_tariff_id, water_tariff_id,
               electricity_billing_method, water_billing_method,
               electricity_reading_id, water_reading_id,
               calculated_total, actual_charged_amount, created_at
        FROM invoices
        WHERE room_id = ${roomId}
          AND billing_period = ${billingPeriod}
      `;

      if (rows.length === 0) {
        // "Chưa có invoice cho kỳ này" là kết quả THÀNH CÔNG hợp lệ —
        // xem ../invoice.repository.ts.
        return ok(null);
      }

      return ok(mapInvoiceRow(rows[0]));
    } catch (error) {
      logDatabaseError("PostgresInvoiceRepository.findByRoomAndPeriod", error);
      return fail("DATABASE_READ_FAILED", "Không thể đọc dữ liệu invoice từ database.");
    }
  }
}

/** Xuất riêng để unit-test ánh xạ row mà không cần database thật. */
export const __testing = { mapInvoiceRow };
