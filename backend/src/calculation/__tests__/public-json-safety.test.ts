// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { calculateMeterUsage } from "../meter/calculate-meter-usage";
import { calculateQuotaFactor } from "../electricity/calculate-quota-factor";
import { calculateTieredElectricity } from "../electricity/calculate-tiered-electricity";
import { calculateFallbackElectricity } from "../electricity/calculate-fallback-electricity";
import { calculateWaterCharge } from "../water/calculate-water-charge";
import { calculateInvoiceTotal } from "../invoice/calculate-invoice-total";
import { calculateBillingDifference } from "../invoice/calculate-billing-difference";
import {
  COMPETITION_ELECTRICITY_TIERS,
  COMPETITION_ELECTRICITY_VAT_RATE,
  COMPETITION_FALLBACK_TIER_NUMBER,
  COMPETITION_PEOPLE_PER_QUOTA_UNIT,
  COMPETITION_WATER_ENVIRONMENTAL_FEE_RATE,
  COMPETITION_WATER_PRICE_PER_CUBIC_METER,
  COMPETITION_WATER_PRICE_PER_PERSON,
  COMPETITION_WATER_VAT_RATE,
} from "./fixtures/competition-defaults";

/**
 * Responsibility:
 * Xác nhận rằng KHÔNG có kết quả public nào của Calculation Core rò rỉ
 * `bigint` ra ngoài — mọi giá trị đo lường/tài chính phải là `string`,
 * an toàn để `JSON.stringify` (đúng như hợp đồng công khai đã ghi trong
 * calculation.types.ts và docs/NUMERIC_PRECISION.md).
 *
 * `JSON.stringify` tự nó SẼ NÉM LỖI nếu gặp một giá trị `bigint` trong
 * object — đây chính là bài kiểm tra: nếu không có hàm nào trong test
 * này throw, nghĩa là không có bigint nào lọt ra ngoài.
 *
 * Does NOT:
 * - kiểm tra lại các giá trị số học (đã có 7 official case + các test
 *   khác). File này CHỈ kiểm tra RANH GIỚI kiểu dữ liệu (type boundary).
 */

function assertNoBigIntLeaks(value: unknown, label: string): void {
  const serialized = JSON.stringify(value);
  assert.ok(serialized !== undefined, `${label}: JSON.stringify không được trả về undefined`);

  function walk(node: unknown): void {
    if (typeof node === "bigint") {
      assert.fail(`${label}: phát hiện bigint rò rỉ ra kết quả public`);
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
    } else if (node !== null && typeof node === "object") {
      for (const value of Object.values(node)) {
        walk(value);
      }
    }
  }
  walk(value);
}

test("calculateMeterUsage: kết quả JSON-safe", () => {
  const result = calculateMeterUsage({ previousReading: "99850", currentReading: "120", meterMaximumValue: "99999" });
  assert.equal(result.success, true);
  if (result.success) {
    assertNoBigIntLeaks(result, "calculateMeterUsage");
  }
});

test("calculateQuotaFactor: kết quả JSON-safe", () => {
  const result = calculateQuotaFactor({ tenantCount: 5, peoplePerQuotaUnit: COMPETITION_PEOPLE_PER_QUOTA_UNIT });
  assert.equal(result.success, true);
  if (result.success) {
    assertNoBigIntLeaks(result, "calculateQuotaFactor");
  }
});

test("calculateTieredElectricity: kết quả JSON-safe (bao gồm appliedTiers)", () => {
  const result = calculateTieredElectricity({
    usageKwh: "200",
    tenantCount: 5,
    peoplePerQuotaUnit: COMPETITION_PEOPLE_PER_QUOTA_UNIT,
    vatRate: COMPETITION_ELECTRICITY_VAT_RATE,
    tiers: COMPETITION_ELECTRICITY_TIERS,
  });
  assert.equal(result.success, true);
  if (result.success) {
    assertNoBigIntLeaks(result, "calculateTieredElectricity");
    // Xác nhận cụ thể: mọi field số học trong appliedTiers là string.
    for (const tier of result.data.appliedTiers) {
      assert.equal(typeof tier.quantityKwh, "string");
      assert.equal(typeof tier.unitPrice, "string");
      assert.equal(typeof tier.amount, "string");
    }
  }
});

test("calculateFallbackElectricity: kết quả JSON-safe", () => {
  const result = calculateFallbackElectricity({
    usageKwh: "120",
    vatRate: COMPETITION_ELECTRICITY_VAT_RATE,
    tiers: COMPETITION_ELECTRICITY_TIERS,
    fallbackTierNumber: COMPETITION_FALLBACK_TIER_NUMBER,
  });
  assert.equal(result.success, true);
  if (result.success) {
    assertNoBigIntLeaks(result, "calculateFallbackElectricity");
  }
});

test("calculateWaterCharge: kết quả JSON-safe", () => {
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
  if (result.success) {
    assertNoBigIntLeaks(result, "calculateWaterCharge");
  }
});

test("calculateInvoiceTotal / calculateBillingDifference: kết quả JSON-safe", () => {
  const invoiceTotal = calculateInvoiceTotal({ electricityExactTotal: "151097.4", waterExactTotal: "117300" });
  assert.equal(invoiceTotal.success, true);
  if (invoiceTotal.success) {
    assertNoBigIntLeaks(invoiceTotal, "calculateInvoiceTotal");
  }

  const difference = calculateBillingDifference({ actualChargedAmount: "480000", legalRoundedTotalVnd: "269244" });
  assert.equal(difference.success, true);
  if (difference.success) {
    assertNoBigIntLeaks(difference, "calculateBillingDifference");
  }
});
