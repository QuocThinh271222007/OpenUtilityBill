// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { allocateElectricityTiers } from "../../electricity/allocate-electricity-tiers";
import { validateElectricityConfig } from "../../electricity/validate-electricity-config";
import { ONE, parseDecimal, toDecimalString } from "../../shared/exact-number";
import { COMPETITION_ELECTRICITY_TIERS } from "../fixtures/competition-defaults";

function parseOrThrow(value: string) {
  const result = parseDecimal(value);
  assert.equal(result.success, true, `parseDecimal("${value}") phải thành công`);
  if (!result.success) throw new Error("unreachable");
  return result.data;
}

test("allocateElectricityTiers: usage = 0 -> không có bậc nào được áp dụng", () => {
  const tiers = validateElectricityConfig(COMPETITION_ELECTRICITY_TIERS);
  assert.equal(tiers.success, true);
  if (!tiers.success) return;
  const applied = allocateElectricityTiers(parseOrThrow("0"), ONE, tiers.data);
  assert.deepEqual(applied, []);
});

test("allocateElectricityTiers: usage đúng bằng ranh giới bậc 1 (50 kWh, quota 1)", () => {
  const tiers = validateElectricityConfig(COMPETITION_ELECTRICITY_TIERS);
  assert.equal(tiers.success, true);
  if (!tiers.success) return;
  const applied = allocateElectricityTiers(parseOrThrow("50"), ONE, tiers.data);
  assert.equal(applied.length, 1);
  assert.equal(applied[0].tierNumber, 1);
  assert.equal(toDecimalString(applied[0].quantityKwh), "50");
});

test("allocateElectricityTiers: usage vượt đúng một ranh giới bậc (100 kWh, quota 1) -> 2 bậc", () => {
  const tiers = validateElectricityConfig(COMPETITION_ELECTRICITY_TIERS);
  assert.equal(tiers.success, true);
  if (!tiers.success) return;
  const applied = allocateElectricityTiers(parseOrThrow("100"), ONE, tiers.data);
  assert.equal(applied.length, 2);
  assert.equal(toDecimalString(applied[0].quantityKwh), "50");
  assert.equal(toDecimalString(applied[1].quantityKwh), "50");
});

test("allocateElectricityTiers: usage lớn, chạm tới bậc không giới hạn", () => {
  const tiers = validateElectricityConfig(COMPETITION_ELECTRICITY_TIERS);
  assert.equal(tiers.success, true);
  if (!tiers.success) return;
  // Tổng 5 bậc có giới hạn (quota=1): 50+50+100+100+100 = 400
  const applied = allocateElectricityTiers(parseOrThrow("450"), ONE, tiers.data);
  const lastApplied = applied[applied.length - 1];
  assert.equal(lastApplied.tierNumber, 6);
  assert.equal(toDecimalString(lastApplied.quantityKwh), "50");
});

test("allocateElectricityTiers: không làm tròn ngưỡng đã điều chỉnh theo quota (62.5)", () => {
  const tiers = validateElectricityConfig(COMPETITION_ELECTRICITY_TIERS);
  assert.equal(tiers.success, true);
  if (!tiers.success) return;
  const quotaFactor = parseOrThrow("1.25");
  const applied = allocateElectricityTiers(parseOrThrow("62.5"), quotaFactor, tiers.data);
  assert.equal(applied.length, 1);
  assert.equal(applied[0].tierNumber, 1);
  assert.equal(toDecimalString(applied[0].quantityKwh), "62.5");
});
