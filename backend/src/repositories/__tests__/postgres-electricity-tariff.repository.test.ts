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
