// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { calculateWaterCharge } from "../../water/calculate-water-charge";
import {
  COMPETITION_WATER_ENVIRONMENTAL_FEE_RATE,
  COMPETITION_WATER_PRICE_PER_CUBIC_METER,
  COMPETITION_WATER_PRICE_PER_PERSON,
  COMPETITION_WATER_VAT_RATE,
} from "../fixtures/competition-defaults";

/**
 * Official test case 6: PER_CUBIC_METER, 12 m3, giá 8500/m3.
 *
 * base = 102000, VAT 5% = 5100, phí môi trường 10% = 10200 (TỪ base,
 * không phải từ base + VAT), total = 117300.
 */
test("OFFICIAL CASE 6: PER_CUBIC_METER, 12 m3 — phí môi trường tính từ base", () => {
  const result = calculateWaterCharge({
    method: "PER_CUBIC_METER",
    waterUsageM3: "12",
    tenantCount: 0,
    pricePerCubicMeter: COMPETITION_WATER_PRICE_PER_CUBIC_METER,
    pricePerPerson: COMPETITION_WATER_PRICE_PER_PERSON,
    vatRate: COMPETITION_WATER_VAT_RATE,
    environmentalFeeRate: COMPETITION_WATER_ENVIRONMENTAL_FEE_RATE,
  });
  assert.equal(result.success, true);
  if (!result.success) return;

  assert.equal(result.data.base, "102000");
  assert.equal(result.data.vatAmount, "5100");
  assert.equal(result.data.environmentalFeeAmount, "10200");
  assert.equal(result.data.exactTotal, "117300");
  assert.equal(result.data.roundedTotalVnd, "117300");

  // Khẳng định tường minh: environmental fee KHÔNG được tính từ
  // (base + VAT). Nếu nhầm, kết quả sẽ là (102000+5100)*0.10 = 10710,
  // khác với 10200.
  const wrongFeeIfComputedFromBasePlusVat = "10710";
  assert.notEqual(result.data.environmentalFeeAmount, wrongFeeIfComputedFromBasePlusVat);
});

test("calculateWaterCharge: PER_PERSON", () => {
  const result = calculateWaterCharge({
    method: "PER_PERSON",
    waterUsageM3: null,
    tenantCount: 4,
    pricePerCubicMeter: COMPETITION_WATER_PRICE_PER_CUBIC_METER,
    pricePerPerson: COMPETITION_WATER_PRICE_PER_PERSON,
    vatRate: COMPETITION_WATER_VAT_RATE,
    environmentalFeeRate: COMPETITION_WATER_ENVIRONMENTAL_FEE_RATE,
  });
  assert.equal(result.success, true);
  if (!result.success) return;

  // base = 4 * 80000 = 320000
  assert.equal(result.data.base, "320000");
  assert.equal(result.data.vatAmount, "16000");
  assert.equal(result.data.environmentalFeeAmount, "32000");
  assert.equal(result.data.exactTotal, "368000");
  assert.equal(result.data.roundedTotalVnd, "368000");
});

test("calculateWaterCharge: method không hợp lệ -> FAIL", () => {
  const result = calculateWaterCharge({
    method: "PER_LITER",
    waterUsageM3: "1",
    tenantCount: 1,
    pricePerCubicMeter: "8500",
    pricePerPerson: "80000",
    vatRate: "0.05",
    environmentalFeeRate: "0.10",
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "INVALID_WATER_METHOD");
  }
});

test("calculateWaterCharge: waterUsageM3 âm -> FAIL", () => {
  const result = calculateWaterCharge({
    method: "PER_CUBIC_METER",
    waterUsageM3: "-1",
    tenantCount: 0,
    pricePerCubicMeter: "8500",
    pricePerPerson: "80000",
    vatRate: "0.05",
    environmentalFeeRate: "0.10",
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "INVALID_DECIMAL");
  }
});

test("calculateWaterCharge: vatRate âm -> FAIL", () => {
  const result = calculateWaterCharge({
    method: "PER_CUBIC_METER",
    waterUsageM3: "10",
    tenantCount: 0,
    pricePerCubicMeter: "8500",
    pricePerPerson: "80000",
    vatRate: "-0.05",
    environmentalFeeRate: "0.10",
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "INVALID_WATER_RATE");
  }
});

test("calculateWaterCharge: vatRate > 1 -> FAIL", () => {
  const result = calculateWaterCharge({
    method: "PER_CUBIC_METER",
    waterUsageM3: "10",
    tenantCount: 0,
    pricePerCubicMeter: "8500",
    pricePerPerson: "80000",
    vatRate: "1.5",
    environmentalFeeRate: "0.10",
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "INVALID_WATER_RATE");
  }
});
