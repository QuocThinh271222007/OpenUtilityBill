// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { closeDatabaseClient, getDatabaseClient } from "../../database/postgres-client";
import { PostgresElectricityTariffUnitOfWork } from "../postgres/postgres-electricity-tariff-unit-of-work";

/**
 * Chứng minh, bằng PostgreSQL THẬT, rằng
 * `PostgresElectricityTariffUnitOfWork` ghi parent (`electricity_tariffs`)
 * + tiers (`electricity_tariff_tiers`) NGUYÊN TỬ: commit đầy đủ khi
 * thành công, và rollback TOÀN BỘ (kể cả tariff cha đã insert) khi một
 * tier sau đó thất bại thật (vi phạm UNIQUE(tariff_id, tier_number)).
 */
const hasDatabaseUrl = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.trim().length > 0;

test(
  "PostgresElectricityTariffUnitOfWork: commit thật — parent + tiers tồn tại sau khi thành công",
  { skip: hasDatabaseUrl ? false : "Cần DATABASE_URL trỏ tới Supabase PostgreSQL thật để chạy test này." },
  async () => {
    const sql = getDatabaseClient();
    const name = `VALIDATION_MANAGEMENT_ELEC_TARIFF_COMMIT_${Date.now()}`;
    let tariffId: string | null = null;

    try {
      const unitOfWork = new PostgresElectricityTariffUnitOfWork();
      const result = await unitOfWork.run(async (repository) => {
        const tariffResult = await repository.createTariff({
          name,
          effectiveFrom: new Date("2026-10-01"),
          effectiveTo: null,
          electricityVatRate: "0.08",
          peoplePerQuotaUnit: 4,
          fallbackTierNumber: 1,
        });
        if (!tariffResult.success) return tariffResult;
        return repository.replaceTiers(tariffResult.data.id, [
          { tierNumber: 1, thresholdKwh: "50", unitPrice: "1000" },
          { tierNumber: 2, thresholdKwh: null, unitPrice: "1500" },
        ]);
      });

      assert.equal(result.success, true);

      const tariffRows = await sql`SELECT id FROM electricity_tariffs WHERE name = ${name}`;
      assert.equal(tariffRows.length, 1);
      tariffId = tariffRows[0].id;

      const tierRows = await sql`SELECT id FROM electricity_tariff_tiers WHERE tariff_id = ${tariffId}`;
      assert.equal(tierRows.length, 2);
    } finally {
      if (tariffId !== null) {
        await sql`DELETE FROM electricity_tariffs WHERE id = ${tariffId}`;
      }
    }
  }
);

test(
  "PostgresElectricityTariffUnitOfWork: rollback thật — vi phạm UNIQUE(tariff_id, tier_number) khiến CẢ tariff cha cũng biến mất",
  { skip: hasDatabaseUrl ? false : "Cần DATABASE_URL trỏ tới Supabase PostgreSQL thật để chạy test này." },
  async () => {
    const sql = getDatabaseClient();
    const name = `VALIDATION_MANAGEMENT_ELEC_TARIFF_ROLLBACK_${Date.now()}`;

    try {
      const unitOfWork = new PostgresElectricityTariffUnitOfWork();
      const result = await unitOfWork.run(async (repository) => {
        const tariffResult = await repository.createTariff({
          name,
          effectiveFrom: new Date("2026-11-01"),
          effectiveTo: null,
          electricityVatRate: "0.08",
          peoplePerQuotaUnit: 4,
          fallbackTierNumber: 1,
        });
        if (!tariffResult.success) return tariffResult;
        // Cố ý trùng tierNumber = 1 ở cả hai tier -> vi phạm THẬT
        // UNIQUE(tariff_id, tier_number) trên tier thứ hai, sau khi
        // tariff cha VÀ tier đầu đã insert thành công trong transaction.
        return repository.replaceTiers(tariffResult.data.id, [
          { tierNumber: 1, thresholdKwh: "50", unitPrice: "1000" },
          { tierNumber: 1, thresholdKwh: null, unitPrice: "1500" },
        ]);
      });

      assert.equal(result.success, false);

      const tariffRows = await sql`SELECT id FROM electricity_tariffs WHERE name = ${name}`;
      assert.equal(tariffRows.length, 0, "Tariff cha không được sót lại sau rollback");
    } finally {
      await sql`DELETE FROM electricity_tariffs WHERE name = ${name}`;
      await closeDatabaseClient();
    }
  }
);
