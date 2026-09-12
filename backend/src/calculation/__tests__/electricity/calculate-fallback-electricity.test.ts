// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { calculateFallbackElectricity } from "../../electricity/calculate-fallback-electricity";
import { calculateTieredElectricity } from "../../electricity/calculate-tiered-electricity";
import {
  DEFAULT_ELECTRICITY_TIERS,
  DEFAULT_ELECTRICITY_VAT_RATE,
  DEFAULT_FALLBACK_TIER_NUMBER,
  DEFAULT_PEOPLE_PER_QUOTA_UNIT,
} from "../fixtures/default-tariffs";

/**
 * Reference test case 5: FALLBACK_TIER_FLAT, 120 kWh, fallbackTierNumber
 * = 3 (đơn giá bậc 3 = 2380).
 *
 * subtotal = 120 * 2380 = 285600, VAT 8% = 22848, total = 308448.
 *
 * So với case 1 (tiered, cùng 120 kWh, 4 người): 308448 - 269244 = 39204.
 */
test("REFERENCE CASE 5: FALLBACK_TIER_FLAT, 120 kWh, fallback tier 3", () => {
  const fallbackResult = calculateFallbackElectricity({
    usageKwh: "120",
    vatRate: DEFAULT_ELECTRICITY_VAT_RATE,
    tiers: DEFAULT_ELECTRICITY_TIERS,
    fallbackTierNumber: DEFAULT_FALLBACK_TIER_NUMBER,
  });
  assert.equal(fallbackResult.success, true);
  if (!fallbackResult.success) return;

  assert.equal(fallbackResult.data.fallbackTierNumber, 3);
  assert.equal(fallbackResult.data.unitPrice, "2380");
  assert.equal(fallbackResult.data.subtotal, "285600");
  assert.equal(fallbackResult.data.vatAmount, "22848");
  assert.equal(fallbackResult.data.exactTotal, "308448");
  assert.equal(fallbackResult.data.roundedTotalVnd, "308448");

  const tieredResult = calculateTieredElectricity({
    usageKwh: "120",
    tenantCount: 4,
    peoplePerQuotaUnit: DEFAULT_PEOPLE_PER_QUOTA_UNIT,
    vatRate: DEFAULT_ELECTRICITY_VAT_RATE,
    tiers: DEFAULT_ELECTRICITY_TIERS,
  });
  assert.equal(tieredResult.success, true);
  if (!tieredResult.success) return;

  const difference =
    BigInt(fallbackResult.data.roundedTotalVnd) - BigInt(tieredResult.data.roundedTotalVnd);
  assert.equal(difference, 39204n);
});

test("calculateFallbackElectricity: KHÔNG dùng chỉ số mảng — chọn đúng tier theo tierNumber dù thứ tự khác", () => {
  const result = calculateFallbackElectricity({
    usageKwh: "10",
    vatRate: "0",
    tiers: [
      { tierNumber: 6, thresholdKwh: null, unitPrice: "999" },
      { tierNumber: 3, thresholdKwh: "100", unitPrice: "2380" },
      { tierNumber: 1, thresholdKwh: "50", unitPrice: "1984" },
    ],
    fallbackTierNumber: 3,
  });
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.unitPrice, "2380");
});

test("calculateFallbackElectricity: fallbackTierNumber không tồn tại -> FAIL", () => {
  const result = calculateFallbackElectricity({
    usageKwh: "10",
    vatRate: "0.08",
    tiers: [
      { tierNumber: 1, thresholdKwh: "50", unitPrice: "1984" },
      { tierNumber: 2, thresholdKwh: null, unitPrice: "2050" },
    ],
    fallbackTierNumber: 9,
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "FALLBACK_TIER_NOT_FOUND");
  }
});
