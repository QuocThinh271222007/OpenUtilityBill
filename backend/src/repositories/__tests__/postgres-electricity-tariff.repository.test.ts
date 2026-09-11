// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { PostgresElectricityTariffRepository, __testing } from "../postgres/postgres-electricity-tariff.repository";
import type { DatabaseExecutor } from "../../database/database.types";

test("mapTariffRow / mapTierRow: ánh xạ đúng, giữ nguyên chuỗi thập phân", () => {
  const tariffRow = {
    id: "1",
    name: "Competition Default Electricity Tariff",
    effective_from: new Date("2025-05-10T00:00:00.000Z"),
    effective_to: new Date("2026-12-31T00:00:00.000Z"),
    electricity_vat_rate: "0.08",
    people_per_quota_unit: 4,
    fallback_tier_number: 3,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
  };
  const tariff = __testing.mapTariffRow(tariffRow);
  assert.equal(tariff.electricityVatRate, "0.08");
  assert.equal(typeof tariff.electricityVatRate, "string");
  assert.equal(tariff.peoplePerQuotaUnit, 4);

  const tierRow = { id: "5", tariff_id: "1", tier_number: 6, threshold_kwh: null, unit_price: "3460" };
  const tier = __testing.mapTierRow(tierRow);
  assert.equal(tier.thresholdKwh, null);
  assert.equal(tier.unitPrice, "3460");
  assert.equal(typeof tier.unitPrice, "string");
});

function createSequencedExecutor(results: unknown[][]): DatabaseExecutor {
  let call = 0;
  const fn = async () => results[Math.min(call++, results.length - 1)];
  return fn as unknown as DatabaseExecutor;
}

test("findApplicableTariffForPeriod: không có tariff nào khớp -> TARIFF_NOT_FOUND", async () => {
  const repository = new PostgresElectricityTariffRepository(createSequencedExecutor([[]]));
  const result = await repository.findApplicableTariffForPeriod(new Date("2026-09-01"));
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "TARIFF_NOT_FOUND");
  }
});

test("findApplicableTariffForPeriod: nhiều hơn một tariff khớp -> AMBIGUOUS_TARIFF_CONFIGURATION, không tự ý chọn đại", async () => {
  const twoTariffs = [
    { id: "1", name: "A", effective_from: new Date("2026-01-01"), effective_to: null, electricity_vat_rate: "0.08", people_per_quota_unit: 4, fallback_tier_number: 3, created_at: new Date() },
    { id: "2", name: "B", effective_from: new Date("2026-01-01"), effective_to: null, electricity_vat_rate: "0.1", people_per_quota_unit: 4, fallback_tier_number: 3, created_at: new Date() },
  ];
  const repository = new PostgresElectricityTariffRepository(createSequencedExecutor([twoTariffs]));
  const result = await repository.findApplicableTariffForPeriod(new Date("2026-09-01"));
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "AMBIGUOUS_TARIFF_CONFIGURATION");
  }
});

function createThrowingExecutor(error: Error): DatabaseExecutor {
  const fn = async () => {
    throw error;
  };
  return fn as unknown as DatabaseExecutor;
}

const SAMPLE_TARIFF_ROW = {
  id: "1",
  name: "Tariff A",
  effective_from: new Date("2026-01-01"),
  effective_to: null,
  electricity_vat_rate: "0.08",
  people_per_quota_unit: 4,
  fallback_tier_number: 3,
  created_at: new Date("2026-01-01"),
};
const SAMPLE_TIER_ROW = { id: "1", tariff_id: "1", tier_number: 1, threshold_kwh: "50", unit_price: "1984" };

test("listAll: trả về tariff kèm tiers đã ánh xạ", async () => {
  // Lời gọi 1: SELECT tariffs -> [SAMPLE_TARIFF_ROW]; lời gọi 2: SELECT tiers cho tariff đó -> [SAMPLE_TIER_ROW].
  const repository = new PostgresElectricityTariffRepository(createSequencedExecutor([[SAMPLE_TARIFF_ROW], [SAMPLE_TIER_ROW]]));
  const result = await repository.listAll();
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0].tiers.length, 1);
  }
});

test("listAll: lỗi database -> DATABASE_READ_FAILED", async () => {
  const repository = new PostgresElectricityTariffRepository(createThrowingExecutor(new Error("timeout")));
  const result = await repository.listAll();
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "DATABASE_READ_FAILED");
});

test("listEffectivePeriods: ánh xạ đúng", async () => {
  const rows = [{ id: "1", effective_from: new Date("2026-01-01"), effective_to: null }];
  const repository = new PostgresElectricityTariffRepository(createSequencedExecutor([rows]));
  const result = await repository.listEffectivePeriods();
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data[0].id, "1");
});

test("isReferencedByInvoice: có hàng -> true; không có hàng -> false", async () => {
  const repositoryTrue = new PostgresElectricityTariffRepository(createSequencedExecutor([[{ "?column?": 1 }]]));
  const trueResult = await repositoryTrue.isReferencedByInvoice("1");
  assert.equal(trueResult.success, true);
  if (trueResult.success) assert.equal(trueResult.data, true);

  const repositoryFalse = new PostgresElectricityTariffRepository(createSequencedExecutor([[]]));
  const falseResult = await repositoryFalse.isReferencedByInvoice("1");
  assert.equal(falseResult.success, true);
  if (falseResult.success) assert.equal(falseResult.data, false);
});

test("createTariff: thành công -> ánh xạ đúng row từ RETURNING", async () => {
  const repository = new PostgresElectricityTariffRepository(createSequencedExecutor([[SAMPLE_TARIFF_ROW]]));
  const result = await repository.createTariff({
    name: "Tariff A",
    effectiveFrom: new Date("2026-01-01"),
    effectiveTo: null,
    electricityVatRate: "0.08",
    peoplePerQuotaUnit: 4,
    fallbackTierNumber: 3,
  });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.name, "Tariff A");
});

test("createTariff: vi phạm UNIQUE(name, effective_from) -> TARIFF_ALREADY_EXISTS", async () => {
  const uniqueViolation = Object.assign(new Error("duplicate key"), { code: "23505" });
  const repository = new PostgresElectricityTariffRepository(createThrowingExecutor(uniqueViolation));
  const result = await repository.createTariff({
    name: "Tariff A",
    effectiveFrom: new Date("2026-01-01"),
    effectiveTo: null,
    electricityVatRate: "0.08",
    peoplePerQuotaUnit: 4,
    fallbackTierNumber: 3,
  });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "TARIFF_ALREADY_EXISTS");
});

test("updateTariffParent: không có hàng nào khớp id -> TARIFF_NOT_FOUND", async () => {
  const repository = new PostgresElectricityTariffRepository(createSequencedExecutor([[]]));
  const result = await repository.updateTariffParent("999", {
    name: "X",
    effectiveFrom: new Date("2026-01-01"),
    effectiveTo: null,
    electricityVatRate: "0.08",
    peoplePerQuotaUnit: 4,
    fallbackTierNumber: 3,
  });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "TARIFF_NOT_FOUND");
});

test("replaceTiers: xoá cũ rồi chèn từng tier mới, trả về đúng số lượng", async () => {
  // Lời gọi 1: DELETE (bỏ qua kết quả); lời gọi 2,3: INSERT từng tier -> RETURNING 1 hàng mỗi lần.
  const repository = new PostgresElectricityTariffRepository(
    createSequencedExecutor([[], [{ ...SAMPLE_TIER_ROW, tier_number: 1 }], [{ ...SAMPLE_TIER_ROW, id: "2", tier_number: 2 }]])
  );
  const result = await repository.replaceTiers("1", [
    { tierNumber: 1, thresholdKwh: "50", unitPrice: "1984" },
    { tierNumber: 2, thresholdKwh: null, unitPrice: "3460" },
  ]);
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.length, 2);
});

test("replaceTiers: lỗi ghi -> DATABASE_WRITE_FAILED", async () => {
  const repository = new PostgresElectricityTariffRepository(createThrowingExecutor(new Error("write failed")));
  const result = await repository.replaceTiers("1", [{ tierNumber: 1, thresholdKwh: null, unitPrice: "1984" }]);
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "DATABASE_WRITE_FAILED");
});
