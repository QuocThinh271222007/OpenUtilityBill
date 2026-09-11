// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../shared/result";
import { logDatabaseError } from "../../database/postgres-client";
import { isUniqueViolation } from "../../database/unique-violation";
import type { DatabaseExecutor } from "../../database/database.types";
import { WaterTariff } from "../../modules/tariff/tariff.model";
import { NewWaterTariff, UpdateWaterTariff, WaterTariffRepository } from "../water-tariff.repository";
import { TariffEffectivePeriod } from "../tariff-shared.types";

/**
 * Trách nhiệm:
 * Implementation Postgres.js của `WaterTariffRepository` — nơi DUY
 * NHẤT chứa SQL truy vấn/ghi `water_tariffs`. Cùng lý do
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

  async listAll(): Promise<Result<WaterTariff[]>> {
    try {
      const rows = await this.sql<WaterTariffRow[]>`
        SELECT id, name, effective_from, effective_to,
               price_per_cubic_meter, price_per_person, vat_rate, environmental_fee_rate, created_at
        FROM water_tariffs
        ORDER BY effective_from DESC, id DESC
      `;
      return ok(rows.map(mapWaterTariffRow));
    } catch (error) {
      logDatabaseError("PostgresWaterTariffRepository.listAll", error);
      return fail("DATABASE_READ_FAILED", "Không thể đọc danh sách water tariff từ database.");
    }
  }

  async listEffectivePeriods(): Promise<Result<TariffEffectivePeriod[]>> {
    try {
      const rows = await this.sql<Array<{ id: string; effective_from: Date; effective_to: Date | null }>>`
        SELECT id, effective_from, effective_to FROM water_tariffs
      `;
      return ok(rows.map((row) => ({ id: row.id, effectiveFrom: row.effective_from, effectiveTo: row.effective_to })));
    } catch (error) {
      logDatabaseError("PostgresWaterTariffRepository.listEffectivePeriods", error);
      return fail("DATABASE_READ_FAILED", "Không thể đọc khoảng hiệu lực water tariff từ database.");
    }
  }

  async isReferencedByInvoice(tariffId: string): Promise<Result<boolean>> {
    try {
      const rows = await this.sql`SELECT 1 FROM invoices WHERE water_tariff_id = ${tariffId} LIMIT 1`;
      return ok(rows.length > 0);
    } catch (error) {
      logDatabaseError("PostgresWaterTariffRepository.isReferencedByInvoice", error);
      return fail("DATABASE_READ_FAILED", "Không thể kiểm tra water tariff có đang được invoice tham chiếu hay không.");
    }
  }

  /** Failure: `TARIFF_ALREADY_EXISTS` khi vi phạm `UNIQUE(name, effective_from)` (SQLSTATE 23505). */
  async create(input: NewWaterTariff): Promise<Result<WaterTariff>> {
    try {
      const rows = await this.sql<WaterTariffRow[]>`
        INSERT INTO water_tariffs (
          name, effective_from, effective_to, price_per_cubic_meter, price_per_person, vat_rate, environmental_fee_rate
        ) VALUES (
          ${input.name}, ${input.effectiveFrom}, ${input.effectiveTo},
          ${input.pricePerCubicMeter}, ${input.pricePerPerson}, ${input.vatRate}, ${input.environmentalFeeRate}
        )
        RETURNING id, name, effective_from, effective_to, price_per_cubic_meter, price_per_person, vat_rate, environmental_fee_rate, created_at
      `;
      return ok(mapWaterTariffRow(rows[0]));
    } catch (error) {
      if (isUniqueViolation(error)) {
        return fail("TARIFF_ALREADY_EXISTS", `Water tariff "${input.name}" với effectiveFrom đã cho đã tồn tại.`);
      }
      logDatabaseError("PostgresWaterTariffRepository.create", error);
      return fail("DATABASE_WRITE_FAILED", "Không thể ghi dữ liệu water tariff vào database.");
    }
  }

  async update(id: string, input: UpdateWaterTariff): Promise<Result<WaterTariff>> {
    try {
      const rows = await this.sql<WaterTariffRow[]>`
        UPDATE water_tariffs SET
          name = ${input.name},
          effective_from = ${input.effectiveFrom},
          effective_to = ${input.effectiveTo},
          price_per_cubic_meter = ${input.pricePerCubicMeter},
          price_per_person = ${input.pricePerPerson},
          vat_rate = ${input.vatRate},
          environmental_fee_rate = ${input.environmentalFeeRate}
        WHERE id = ${id}
        RETURNING id, name, effective_from, effective_to, price_per_cubic_meter, price_per_person, vat_rate, environmental_fee_rate, created_at
      `;
      if (rows.length === 0) {
        return fail("TARIFF_NOT_FOUND", `Không tìm thấy water tariff với id = ${id}.`);
      }
      return ok(mapWaterTariffRow(rows[0]));
    } catch (error) {
      if (isUniqueViolation(error)) {
        return fail("TARIFF_ALREADY_EXISTS", `Water tariff "${input.name}" với effectiveFrom đã cho đã tồn tại.`);
      }
      logDatabaseError("PostgresWaterTariffRepository.update", error);
      return fail("DATABASE_WRITE_FAILED", "Không thể cập nhật dữ liệu water tariff vào database.");
    }
  }
}

/** Xuất riêng để unit-test ánh xạ row mà không cần database thật. */
export const __testing = { mapWaterTariffRow };
