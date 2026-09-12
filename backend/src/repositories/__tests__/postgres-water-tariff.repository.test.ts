// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { PostgresWaterTariffRepository, __testing } from "../postgres/postgres-water-tariff.repository";
import type { DatabaseExecutor } from "../../database/database.types";

test("mapWaterTariffRow: ánh xạ đúng, giữ nguyên chuỗi thập phân", () => {
  const row = {
    id: "1",
    name: "Biểu giá nước mặc định",
    effective_from: new Date("2026-09-06T00:00:00.000Z"),
    effective_to: null,
    price_per_cubic_meter: "8500",
    price_per_person: "80000",
    vat_rate: "0.05",
    environmental_fee_rate: "0.10",
    created_at: new Date("2026-09-06T00:00:00.000Z"),
  };
  const tariff = __testing.mapWaterTariffRow(row);
  assert.equal(tariff.vatRate, "0.05");
  assert.equal(tariff.environmentalFeeRate, "0.10");
  assert.equal(tariff.effectiveTo, null);
});

function createSequencedExecutor(results: unknown[][]): DatabaseExecutor {
  let call = 0;
  const fn = async () => results[Math.min(call++, results.length - 1)];
  return fn as unknown as DatabaseExecutor;
}

test("findApplicableTariffForPeriod: nhiều hơn một tariff khớp -> AMBIGUOUS_TARIFF_CONFIGURATION", async () => {
  const rows = [
    { id: "1", name: "A", effective_from: new Date(), effective_to: null, price_per_cubic_meter: "8500", price_per_person: "80000", vat_rate: "0.05", environmental_fee_rate: "0.10", created_at: new Date() },
    { id: "2", name: "B", effective_from: new Date(), effective_to: null, price_per_cubic_meter: "9000", price_per_person: "85000", vat_rate: "0.05", environmental_fee_rate: "0.10", created_at: new Date() },
  ];
  const repository = new PostgresWaterTariffRepository(createSequencedExecutor([rows]));
  const result = await repository.findApplicableTariffForPeriod(new Date("2026-09-06"));
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "AMBIGUOUS_TARIFF_CONFIGURATION");
  }
});

test("findApplicableTariffForPeriod: không khớp -> TARIFF_NOT_FOUND", async () => {
  const repository = new PostgresWaterTariffRepository(createSequencedExecutor([[]]));
  const result = await repository.findApplicableTariffForPeriod(new Date("2020-01-01"));
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "TARIFF_NOT_FOUND");
  }
});

function createThrowingExecutor(error: Error): DatabaseExecutor {
  const fn = async () => {
    throw error;
  };
  return fn as unknown as DatabaseExecutor;
}

const SAMPLE_WATER_ROW = {
  id: "1",
  name: "Water A",
  effective_from: new Date("2026-01-01"),
  effective_to: null,
  price_per_cubic_meter: "8500",
  price_per_person: "80000",
  vat_rate: "0.05",
  environmental_fee_rate: "0.10",
  created_at: new Date("2026-01-01"),
};

test("listAll: trả về danh sách đã ánh xạ", async () => {
  const repository = new PostgresWaterTariffRepository(createSequencedExecutor([[SAMPLE_WATER_ROW]]));
  const result = await repository.listAll();
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.length, 1);
});

test("listAll: lỗi database -> DATABASE_READ_FAILED", async () => {
  const repository = new PostgresWaterTariffRepository(createThrowingExecutor(new Error("timeout")));
  const result = await repository.listAll();
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "DATABASE_READ_FAILED");
});

test("listEffectivePeriods: ánh xạ đúng", async () => {
  const rows = [{ id: "1", effective_from: new Date("2026-01-01"), effective_to: null }];
  const repository = new PostgresWaterTariffRepository(createSequencedExecutor([rows]));
  const result = await repository.listEffectivePeriods();
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data[0].id, "1");
});

test("isReferencedByInvoice: có hàng -> true; không có hàng -> false", async () => {
  const repositoryTrue = new PostgresWaterTariffRepository(createSequencedExecutor([[{ "?column?": 1 }]]));
  const trueResult = await repositoryTrue.isReferencedByInvoice("1");
  assert.equal(trueResult.success, true);
  if (trueResult.success) assert.equal(trueResult.data, true);

  const repositoryFalse = new PostgresWaterTariffRepository(createSequencedExecutor([[]]));
  const falseResult = await repositoryFalse.isReferencedByInvoice("1");
  assert.equal(falseResult.success, true);
  if (falseResult.success) assert.equal(falseResult.data, false);
});

test("create: thành công -> ánh xạ đúng row từ RETURNING", async () => {
  const repository = new PostgresWaterTariffRepository(createSequencedExecutor([[SAMPLE_WATER_ROW]]));
  const result = await repository.create({
    name: "Water A",
    effectiveFrom: new Date("2026-01-01"),
    effectiveTo: null,
    pricePerCubicMeter: "8500",
    pricePerPerson: "80000",
    vatRate: "0.05",
    environmentalFeeRate: "0.10",
  });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.name, "Water A");
});

test("create: vi phạm UNIQUE(name, effective_from) -> TARIFF_ALREADY_EXISTS", async () => {
  const uniqueViolation = Object.assign(new Error("duplicate key"), { code: "23505" });
  const repository = new PostgresWaterTariffRepository(createThrowingExecutor(uniqueViolation));
  const result = await repository.create({
    name: "Water A",
    effectiveFrom: new Date("2026-01-01"),
    effectiveTo: null,
    pricePerCubicMeter: "8500",
    pricePerPerson: "80000",
    vatRate: "0.05",
    environmentalFeeRate: "0.10",
  });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "TARIFF_ALREADY_EXISTS");
});

test("update: không có hàng nào khớp id -> TARIFF_NOT_FOUND", async () => {
  const repository = new PostgresWaterTariffRepository(createSequencedExecutor([[]]));
  const result = await repository.update("999", {
    name: "X",
    effectiveFrom: new Date("2026-01-01"),
    effectiveTo: null,
    pricePerCubicMeter: "8500",
    pricePerPerson: "80000",
    vatRate: "0.05",
    environmentalFeeRate: "0.10",
  });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "TARIFF_NOT_FOUND");
});

test("update: lỗi ghi -> DATABASE_WRITE_FAILED", async () => {
  const repository = new PostgresWaterTariffRepository(createThrowingExecutor(new Error("write failed")));
  const result = await repository.update("1", {
    name: "X",
    effectiveFrom: new Date("2026-01-01"),
    effectiveTo: null,
    pricePerCubicMeter: "8500",
    pricePerPerson: "80000",
    vatRate: "0.05",
    environmentalFeeRate: "0.10",
  });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "DATABASE_WRITE_FAILED");
});
