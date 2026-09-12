// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { closeDatabaseClient, getDatabaseClient } from "../../database/postgres-client";
import { PostgresElectricityTariffRepository } from "../postgres/postgres-electricity-tariff.repository";
import { PostgresWaterTariffRepository } from "../postgres/postgres-water-tariff.repository";

/**
 * Trách nhiệm:
 * Chứng minh, bằng PostgreSQL THẬT, rằng các Repository đọc đúng dữ liệu
 * seed chính thức (`database/seeds/001_default_tariffs.sql`)
 * — không phải dữ liệu giả lập trong unit test.
 *
 * Không chịu trách nhiệm:
 * - ghi/sửa/xoá bất kỳ dữ liệu nào — CHỈ đọc (read-only), an toàn để
 *   chạy nhiều lần trên cùng một database mà không cần dọn dẹp.
 * - claim PASS nếu không có DATABASE_URL, hoặc nếu migration/seed chưa
 *   chạy trên database đó — SKIP rõ ràng.
 *
 * Điều kiện trước khi chạy: migration 001+002 và seed
 * 001_default_tariffs.sql đã chạy trên database mà DATABASE_URL
 * trỏ tới.
 *
 * Về định dạng chuỗi NUMERIC kỳ vọng bên dưới (QUAN TRỌNG):
 * PostgreSQL trả về NUMERIC theo ĐÚNG SCALE đã khai báo ở migration —
 * không tự cắt số 0 ở cuối. `electricity_vat_rate` là
 * `NUMERIC(5, 4)` nên đọc lại là `"0.0800"` (4 chữ số thập phân), KHÔNG
 * phải `"0.08"`; `unit_price`/`price_per_cubic_meter`/`price_per_person`
 * là `NUMERIC(14, 2)` nên đọc lại là `"3460.00"`/`"8500.00"`/
 * `"80000.00"` (2 chữ số thập phân). Đây KHÔNG phải một vấn đề chính
 * xác (precision) — `"0.08"` và `"0.0800"` biểu diễn CÙNG một giá trị
 * chính xác tuyệt đối. Repository CỐ Ý không chuẩn hoá (canonicalize)
 * chuỗi này — xem docs/DATABASE_ACCESS.md mục "Định dạng chuỗi NUMERIC
 * không được chuẩn hoá". Calculation Core (`parseDecimal`) chấp nhận cả
 * hai dạng như nhau.
 */
const hasDatabaseUrl = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.trim().length > 0;

test(
  "PostgresElectricityTariffRepository: đọc đúng tariff + 6 tier mặc định",
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

      assert.equal(result.data.tariff.name, "Biểu giá điện mặc định");
      // electricity_vat_rate là NUMERIC(5, 4) -> "0.0800", không phải
      // "0.08" (xem giải thích scale ở đầu file).
      assert.equal(result.data.tariff.electricityVatRate, "0.0800");
      assert.equal(result.data.tariff.peoplePerQuotaUnit, 4);
      assert.equal(result.data.tariff.fallbackTierNumber, 3);
      assert.equal(typeof result.data.tariff.id, "string");

      assert.equal(result.data.tiers.length, 6);
      assert.deepEqual(
        result.data.tiers.map((t) => t.tierNumber),
        [1, 2, 3, 4, 5, 6]
      );
      assert.equal(result.data.tiers[5].thresholdKwh, null);
      // unit_price là NUMERIC(14, 2) -> "3460.00", không phải "3460".
      assert.equal(result.data.tiers[5].unitPrice, "3460.00");
    } finally {
      await closeDatabaseClient();
    }
  }
);

test(
  "PostgresWaterTariffRepository: đọc đúng tariff nước mặc định",
  { skip: hasDatabaseUrl ? false : "Cần DATABASE_URL trỏ tới Supabase PostgreSQL đã chạy migration + seed." },
  async () => {
    const sql = getDatabaseClient();
    try {
      const repository = new PostgresWaterTariffRepository(sql);
      const result = await repository.findApplicableTariffForPeriod(new Date("2026-09-06"));

      assert.equal(result.success, true);
      if (!result.success) return;

      assert.equal(result.data.name, "Biểu giá nước mặc định");
      // price_per_cubic_meter/price_per_person là NUMERIC(14, 2);
      // vat_rate/environmental_fee_rate là NUMERIC(5, 4) — xem giải
      // thích scale ở đầu file.
      assert.equal(result.data.pricePerCubicMeter, "8500.00");
      assert.equal(result.data.pricePerPerson, "80000.00");
      assert.equal(result.data.vatRate, "0.0500");
      assert.equal(result.data.environmentalFeeRate, "0.1000");
      assert.equal(result.data.effectiveTo, null);
    } finally {
      await closeDatabaseClient();
    }
  }
);
