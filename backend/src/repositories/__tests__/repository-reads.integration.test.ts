// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { closeDatabaseClient, getDatabaseClient } from "../../database/postgres-client";
import { PostgresElectricityTariffRepository } from "../postgres/postgres-electricity-tariff.repository";
import { PostgresWaterTariffRepository } from "../postgres/postgres-water-tariff.repository";

/**
 * Responsibility:
 * Chứng minh, bằng PostgreSQL THẬT, rằng các Repository đọc đúng dữ liệu
 * seed chính thức của kỳ thi (`database/seeds/001_competition_defaults.sql`)
 * — không phải dữ liệu giả lập trong unit test.
 *
 * Does NOT:
 * - ghi/sửa/xoá bất kỳ dữ liệu nào — CHỈ đọc (read-only), an toàn để
 *   chạy nhiều lần trên cùng một database mà không cần dọn dẹp.
 * - claim PASS nếu không có DATABASE_URL, hoặc nếu migration/seed chưa
 *   chạy trên database đó — SKIP rõ ràng.
 *
 * Điều kiện trước khi chạy: migration 001+002 và seed
 * 001_competition_defaults.sql đã chạy trên database mà DATABASE_URL
 * trỏ tới.
 */
const hasDatabaseUrl = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.trim().length > 0;

test(
  "PostgresElectricityTariffRepository: đọc đúng tariff + 6 tier mặc định của kỳ thi",
  { skip: hasDatabaseUrl ? false : "Cần DATABASE_URL trỏ tới Supabase PostgreSQL đã chạy migration + seed." },
  async () => {
    const sql = getDatabaseClient();
    try {
      const repository = new PostgresElectricityTariffRepository(sql);
      // 2026-09-01 nằm trong khoảng hiệu lực của seed
      // (2025-05-10 .. 2026-12-31).
      const result = await repository.findApplicableTariffForPeriod(new Date("2026-09-01"));

      assert.equal(result.success, true);
      if (!result.success) return;

      assert.equal(result.data.tariff.name, "Competition Default Electricity Tariff");
      assert.equal(result.data.tariff.electricityVatRate, "0.08");
      assert.equal(result.data.tariff.peoplePerQuotaUnit, 4);
      assert.equal(result.data.tariff.fallbackTierNumber, 3);
      assert.equal(typeof result.data.tariff.id, "string");

      assert.equal(result.data.tiers.length, 6);
      assert.deepEqual(
        result.data.tiers.map((t) => t.tierNumber),
        [1, 2, 3, 4, 5, 6]
      );
      assert.equal(result.data.tiers[5].thresholdKwh, null);
      assert.equal(result.data.tiers[5].unitPrice, "3460");
    } finally {
      await closeDatabaseClient();
    }
  }
);

test(
  "PostgresWaterTariffRepository: đọc đúng tariff nước mặc định của kỳ thi",
  { skip: hasDatabaseUrl ? false : "Cần DATABASE_URL trỏ tới Supabase PostgreSQL đã chạy migration + seed." },
  async () => {
    const sql = getDatabaseClient();
    try {
      const repository = new PostgresWaterTariffRepository(sql);
      const result = await repository.findApplicableTariffForPeriod(new Date("2026-09-06"));

      assert.equal(result.success, true);
      if (!result.success) return;

      assert.equal(result.data.name, "Competition Default Water Tariff");
      assert.equal(result.data.pricePerCubicMeter, "8500");
      assert.equal(result.data.pricePerPerson, "80000");
      assert.equal(result.data.vatRate, "0.05");
      assert.equal(result.data.environmentalFeeRate, "0.10");
      assert.equal(result.data.effectiveTo, null);
    } finally {
      await closeDatabaseClient();
    }
  }
);
