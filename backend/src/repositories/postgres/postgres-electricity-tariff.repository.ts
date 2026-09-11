// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../shared/result";
import { logDatabaseError } from "../../database/postgres-client";
import type { DatabaseExecutor } from "../../database/database.types";
import { ElectricityTariff, ElectricityTariffTier } from "../../modules/tariff/tariff.model";
import { ElectricityTariffRepository, ElectricityTariffWithTiers } from "../electricity-tariff.repository";

/**
 * Responsibility:
 * Implementation Postgres.js của `ElectricityTariffRepository` — nơi
 * DUY NHẤT chứa SQL truy vấn `electricity_tariffs` và
 * `electricity_tariff_tiers`.
 *
 * Does NOT:
 * - tự ý chọn một tariff khi có nhiều hơn một hàng khớp điều kiện hiệu
 *   lực — xem `AMBIGUOUS_TARIFF_CONFIGURATION` trong
 *   `../electricity-tariff.repository.ts`.
 * - giả định đúng 6 bậc, hay dựa vào thứ tự hàng tự nhiên của
 *   PostgreSQL cho các bậc — luôn `ORDER BY tier_number ASC` tường
 *   minh.
 * - chứa bất kỳ hằng số biểu giá nào của kỳ thi (1984, 0.08, ...) — mọi
 *   giá trị đến từ database.
 */
interface ElectricityTariffRow {
  id: string;
  name: string;
  effective_from: Date;
  effective_to: Date | null;
  electricity_vat_rate: string;
  people_per_quota_unit: number;
  fallback_tier_number: number;
  created_at: Date;
}

interface ElectricityTariffTierRow {
  id: string;
  tariff_id: string;
  tier_number: number;
  threshold_kwh: string | null;
  unit_price: string;
}

function mapTariffRow(row: ElectricityTariffRow): ElectricityTariff {
  return {
    id: row.id,
    name: row.name,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    electricityVatRate: row.electricity_vat_rate,
    peoplePerQuotaUnit: row.people_per_quota_unit,
    fallbackTierNumber: row.fallback_tier_number,
    createdAt: row.created_at,
  };
}

function mapTierRow(row: ElectricityTariffTierRow): ElectricityTariffTier {
  return {
    id: row.id,
    tariffId: row.tariff_id,
    tierNumber: row.tier_number,
    thresholdKwh: row.threshold_kwh,
    unitPrice: row.unit_price,
  };
}

export class PostgresElectricityTariffRepository implements ElectricityTariffRepository {
  constructor(private readonly sql: DatabaseExecutor) {}

  async findApplicableTariffForPeriod(billingPeriod: Date): Promise<Result<ElectricityTariffWithTiers>> {
    try {
      const tariffRows = await this.sql<ElectricityTariffRow[]>`
        SELECT id, name, effective_from, effective_to,
               electricity_vat_rate, people_per_quota_unit, fallback_tier_number, created_at
        FROM electricity_tariffs
        WHERE effective_from <= ${billingPeriod}
          AND (effective_to IS NULL OR effective_to >= ${billingPeriod})
      `;

      if (tariffRows.length === 0) {
        return fail(
          "TARIFF_NOT_FOUND",
          `Không tìm thấy electricity tariff có hiệu lực tại kỳ ${billingPeriod.toISOString().slice(0, 10)}.`
        );
      }
      if (tariffRows.length > 1) {
        // Schema không ngăn hai tariff khác tên có khoảng hiệu lực
        // chồng lấn (xem docs/DATABASE_DESIGN.md) — KHÔNG tự ý chọn một
        // hàng, báo lỗi rõ ràng để người quản trị sửa cấu hình.
        return fail(
          "AMBIGUOUS_TARIFF_CONFIGURATION",
          `Có ${tariffRows.length} electricity tariff cùng có hiệu lực tại kỳ ${billingPeriod.toISOString().slice(0, 10)} — cấu hình mơ hồ, cần sửa trước khi tính hoá đơn.`
        );
      }

      const tariff = mapTariffRow(tariffRows[0]);

      const tierRows = await this.sql<ElectricityTariffTierRow[]>`
        SELECT id, tariff_id, tier_number, threshold_kwh, unit_price
        FROM electricity_tariff_tiers
        WHERE tariff_id = ${tariff.id}
        ORDER BY tier_number ASC
      `;

      return ok({ tariff, tiers: tierRows.map(mapTierRow) });
    } catch (error) {
      logDatabaseError("PostgresElectricityTariffRepository.findApplicableTariffForPeriod", error);
      return fail("DATABASE_READ_FAILED", "Không thể đọc dữ liệu electricity tariff từ database.");
    }
  }
}

/** Xuất riêng để unit-test ánh xạ row mà không cần database thật. */
export const __testing = { mapTariffRow, mapTierRow };
