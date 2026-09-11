// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { closeDatabaseClient, getDatabaseClient } from "../../database/postgres-client";
import { PostgresWaterTariffRepository } from "../postgres/postgres-water-tariff.repository";

/** Chứng minh, bằng PostgreSQL THẬT, chu trình create -> update cho `PostgresWaterTariffRepository`. */
const hasDatabaseUrl = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.trim().length > 0;

test(
  "PostgresWaterTariffRepository: create -> update, và UNIQUE(name, effective_from) THẬT -> TARIFF_ALREADY_EXISTS",
  { skip: hasDatabaseUrl ? false : "Cần DATABASE_URL trỏ tới Supabase PostgreSQL thật để chạy test này." },
  async () => {
    const sql = getDatabaseClient();
    const repository = new PostgresWaterTariffRepository(sql);
    const name = `VALIDATION_MANAGEMENT_WATER_TARIFF_${Date.now()}`;
    let tariffId: string | null = null;

    try {
      const createResult = await repository.create({
        name,
        effectiveFrom: new Date("2026-10-01"),
        effectiveTo: null,
        pricePerCubicMeter: "8500",
        pricePerPerson: "80000",
        vatRate: "0.05",
        environmentalFeeRate: "0.10",
      });
      assert.equal(createResult.success, true);
      if (!createResult.success) return;
      tariffId = createResult.data.id;

      const updateResult = await repository.update(tariffId, {
        name,
        effectiveFrom: new Date("2026-10-01"),
        effectiveTo: null,
        pricePerCubicMeter: "9000",
        pricePerPerson: "85000",
        vatRate: "0.05",
        environmentalFeeRate: "0.10",
      });
      assert.equal(updateResult.success, true);
      if (updateResult.success) assert.equal(updateResult.data.pricePerCubicMeter, "9000.00");

      const duplicateResult = await repository.create({
        name,
        effectiveFrom: new Date("2026-10-01"),
        effectiveTo: null,
        pricePerCubicMeter: "1",
        pricePerPerson: "1",
        vatRate: "0.05",
        environmentalFeeRate: "0.10",
      });
      assert.equal(duplicateResult.success, false);
      if (!duplicateResult.success) assert.equal(duplicateResult.error.code, "TARIFF_ALREADY_EXISTS");
    } finally {
      if (tariffId !== null) {
        await sql`DELETE FROM water_tariffs WHERE id = ${tariffId}`;
      }
      await closeDatabaseClient();
    }
  }
);
