// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../shared/result";
import { logDatabaseError } from "../../database/postgres-client";
import { isUniqueViolation } from "../../database/unique-violation";
import type { DatabaseExecutor } from "../../database/database.types";
import { ElectricityTariff, ElectricityTariffTier } from "../../modules/tariff/tariff.model";
import {
  ElectricityTariffRepository,
  ElectricityTariffWithTiers,
  NewElectricityTariff,
  NewElectricityTariffTier,
  TariffEffectivePeriod,
  UpdateElectricityTariffParent,
} from "../electricity-tariff.repository";

/**
 * Responsibility:
 * Implementation Postgres.js của `ElectricityTariffRepository` — nơi
 * DUY NHẤT chứa SQL truy vấn/ghi `electricity_tariffs` và
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
 *   giá trị đến từ database/tham số gọi vào.
 * - tự mở transaction cho `createTariff`/`replaceTiers`/
 *   `updateTariffParent` — xem `../electricity-tariff-unit-of-work.ts`.
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

  async listAll(): Promise<Result<ElectricityTariffWithTiers[]>> {
    try {
      const tariffRows = await this.sql<ElectricityTariffRow[]>`
        SELECT id, name, effective_from, effective_to,
               electricity_vat_rate, people_per_quota_unit, fallback_tier_number, created_at
        FROM electricity_tariffs
        ORDER BY effective_from DESC, id DESC
      `;

      const result: ElectricityTariffWithTiers[] = [];
      for (const tariffRow of tariffRows) {
        const tariff = mapTariffRow(tariffRow);
        const tierRows = await this.sql<ElectricityTariffTierRow[]>`
          SELECT id, tariff_id, tier_number, threshold_kwh, unit_price
          FROM electricity_tariff_tiers
          WHERE tariff_id = ${tariff.id}
          ORDER BY tier_number ASC
        `;
        result.push({ tariff, tiers: tierRows.map(mapTierRow) });
      }
      return ok(result);
    } catch (error) {
      logDatabaseError("PostgresElectricityTariffRepository.listAll", error);
      return fail("DATABASE_READ_FAILED", "Không thể đọc danh sách electricity tariff từ database.");
    }
  }

  async listEffectivePeriods(): Promise<Result<TariffEffectivePeriod[]>> {
    try {
      const rows = await this.sql<Array<{ id: string; effective_from: Date; effective_to: Date | null }>>`
        SELECT id, effective_from, effective_to FROM electricity_tariffs
      `;
      return ok(rows.map((row) => ({ id: row.id, effectiveFrom: row.effective_from, effectiveTo: row.effective_to })));
    } catch (error) {
      logDatabaseError("PostgresElectricityTariffRepository.listEffectivePeriods", error);
      return fail("DATABASE_READ_FAILED", "Không thể đọc khoảng hiệu lực electricity tariff từ database.");
    }
  }

  async isReferencedByInvoice(tariffId: string): Promise<Result<boolean>> {
    try {
      const rows = await this.sql`SELECT 1 FROM invoices WHERE electricity_tariff_id = ${tariffId} LIMIT 1`;
      return ok(rows.length > 0);
    } catch (error) {
      logDatabaseError("PostgresElectricityTariffRepository.isReferencedByInvoice", error);
      return fail("DATABASE_READ_FAILED", "Không thể kiểm tra electricity tariff có đang được invoice tham chiếu hay không.");
    }
  }

  /** Failure: `TARIFF_ALREADY_EXISTS` khi vi phạm `UNIQUE(name, effective_from)` (SQLSTATE 23505). */
  async createTariff(input: NewElectricityTariff): Promise<Result<ElectricityTariff>> {
    try {
      const rows = await this.sql<ElectricityTariffRow[]>`
        INSERT INTO electricity_tariffs (
          name, effective_from, effective_to, electricity_vat_rate, people_per_quota_unit, fallback_tier_number
        ) VALUES (
          ${input.name}, ${input.effectiveFrom}, ${input.effectiveTo},
          ${input.electricityVatRate}, ${input.peoplePerQuotaUnit}, ${input.fallbackTierNumber}
        )
        RETURNING id, name, effective_from, effective_to, electricity_vat_rate, people_per_quota_unit, fallback_tier_number, created_at
      `;
      return ok(mapTariffRow(rows[0]));
    } catch (error) {
      if (isUniqueViolation(error)) {
        return fail("TARIFF_ALREADY_EXISTS", `Electricity tariff "${input.name}" với effectiveFrom đã cho đã tồn tại.`);
      }
      logDatabaseError("PostgresElectricityTariffRepository.createTariff", error);
      return fail("DATABASE_WRITE_FAILED", "Không thể ghi dữ liệu electricity tariff vào database.");
    }
  }

  async updateTariffParent(id: string, input: UpdateElectricityTariffParent): Promise<Result<ElectricityTariff>> {
    try {
      const rows = await this.sql<ElectricityTariffRow[]>`
        UPDATE electricity_tariffs SET
          name = ${input.name},
          effective_from = ${input.effectiveFrom},
          effective_to = ${input.effectiveTo},
          electricity_vat_rate = ${input.electricityVatRate},
          people_per_quota_unit = ${input.peoplePerQuotaUnit},
          fallback_tier_number = ${input.fallbackTierNumber}
        WHERE id = ${id}
        RETURNING id, name, effective_from, effective_to, electricity_vat_rate, people_per_quota_unit, fallback_tier_number, created_at
      `;
      if (rows.length === 0) {
        return fail("TARIFF_NOT_FOUND", `Không tìm thấy electricity tariff với id = ${id}.`);
      }
      return ok(mapTariffRow(rows[0]));
    } catch (error) {
      if (isUniqueViolation(error)) {
        return fail("TARIFF_ALREADY_EXISTS", `Electricity tariff "${input.name}" với effectiveFrom đã cho đã tồn tại.`);
      }
      logDatabaseError("PostgresElectricityTariffRepository.updateTariffParent", error);
      return fail("DATABASE_WRITE_FAILED", "Không thể cập nhật dữ liệu electricity tariff vào database.");
    }
  }

  /**
   * Xoá toàn bộ tier cũ rồi chèn tier mới — PHẢI được gọi bên trong
   * cùng transaction với `createTariff`/`updateTariffParent`
   * (`ElectricityTariffUnitOfWork`) để không bao giờ để lại trạng thái
   * "cha đã cập nhật nhưng tier chỉ ghi được một nửa".
   */
  async replaceTiers(tariffId: string, tiers: NewElectricityTariffTier[]): Promise<Result<ElectricityTariffTier[]>> {
    try {
      await this.sql`DELETE FROM electricity_tariff_tiers WHERE tariff_id = ${tariffId}`;

      const created: ElectricityTariffTier[] = [];
      for (const tier of tiers) {
        const rows = await this.sql<ElectricityTariffTierRow[]>`
          INSERT INTO electricity_tariff_tiers (tariff_id, tier_number, threshold_kwh, unit_price)
          VALUES (${tariffId}, ${tier.tierNumber}, ${tier.thresholdKwh}, ${tier.unitPrice})
          RETURNING id, tariff_id, tier_number, threshold_kwh, unit_price
        `;
        created.push(mapTierRow(rows[0]));
      }
      return ok(created);
    } catch (error) {
      logDatabaseError("PostgresElectricityTariffRepository.replaceTiers", error);
      return fail("DATABASE_WRITE_FAILED", "Không thể ghi dữ liệu electricity tariff tiers vào database.");
    }
  }
}

/** Xuất riêng để unit-test ánh xạ row mà không cần database thật. */
export const __testing = { mapTariffRow, mapTierRow };
