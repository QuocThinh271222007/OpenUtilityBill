// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../shared/result";
import { logDatabaseError } from "../../database/postgres-client";
import type { DatabaseExecutor } from "../../database/database.types";
import { WaterTariff } from "../../modules/tariff/tariff.model";
import { WaterTariffRepository } from "../water-tariff.repository";

/**
 * Responsibility:
 * Implementation Postgres.js của `WaterTariffRepository` — nơi DUY
 * NHẤT chứa SQL truy vấn `water_tariffs`. Cùng lý do
 * `AMBIGUOUS_TARIFF_CONFIGURATION` như
 * `postgres-electricity-tariff.repository.ts` (xem file đó).
 */
interface WaterTariffRow {
  id: string;
  name: string;
  effective_from: Date;
  effective_to: Date | null;
  price_per_cubic_meter: string;
  price_per_person: string;
  vat_rate: string;
  environmental_fee_rate: string;
  created_at: Date;
}

function mapWaterTariffRow(row: WaterTariffRow): WaterTariff {
  return {
    id: row.id,
    name: row.name,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    pricePerCubicMeter: row.price_per_cubic_meter,
    pricePerPerson: row.price_per_person,
    vatRate: row.vat_rate,
    environmentalFeeRate: row.environmental_fee_rate,
    createdAt: row.created_at,
  };
}

export class PostgresWaterTariffRepository implements WaterTariffRepository {
  constructor(private readonly sql: DatabaseExecutor) {}

  async findApplicableTariffForPeriod(billingPeriod: Date): Promise<Result<WaterTariff>> {
    try {
      const rows = await this.sql<WaterTariffRow[]>`
        SELECT id, name, effective_from, effective_to,
               price_per_cubic_meter, price_per_person, vat_rate, environmental_fee_rate, created_at
        FROM water_tariffs
        WHERE effective_from <= ${billingPeriod}
          AND (effective_to IS NULL OR effective_to >= ${billingPeriod})
      `;

      if (rows.length === 0) {
        return fail(
          "TARIFF_NOT_FOUND",
          `Không tìm thấy water tariff có hiệu lực tại kỳ ${billingPeriod.toISOString().slice(0, 10)}.`
        );
      }
      if (rows.length > 1) {
        return fail(
          "AMBIGUOUS_TARIFF_CONFIGURATION",
          `Có ${rows.length} water tariff cùng có hiệu lực tại kỳ ${billingPeriod.toISOString().slice(0, 10)} — cấu hình mơ hồ, cần sửa trước khi tính hoá đơn.`
        );
      }

      return ok(mapWaterTariffRow(rows[0]));
    } catch (error) {
      logDatabaseError("PostgresWaterTariffRepository.findApplicableTariffForPeriod", error);
      return fail("DATABASE_READ_FAILED", "Không thể đọc dữ liệu water tariff từ database.");
    }
  }
}

/** Xuất riêng để unit-test ánh xạ row mà không cần database thật. */
export const __testing = { mapWaterTariffRow };
