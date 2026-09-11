// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { calculateBillingDifference } from "../../invoice/calculate-billing-difference";

/**
 * Official test case 7: legal calculated total (case 1) = 269244.
 * Actual charged = 4000 * 120 = 480000.
 * difference = 480000 - 269244 = 210756 (dương: khách trả nhiều hơn).
 */
test("OFFICIAL CASE 7: actual charge so với tổng hợp pháp", () => {
  const result = calculateBillingDifference({
    actualChargedAmount: "480000",
    legalRoundedTotalVnd: "269244",
  });
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data, "210756");
});

test("calculateBillingDifference: bằng nhau -> 0", () => {
  const result = calculateBillingDifference({ actualChargedAmount: "100000", legalRoundedTotalVnd: "100000" });
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data, "0");
});

test("calculateBillingDifference: khách trả ít hơn -> âm", () => {
  const result = calculateBillingDifference({ actualChargedAmount: "90000", legalRoundedTotalVnd: "100000" });
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data, "-10000");
});

test("calculateBillingDifference: actualChargedAmount âm -> FAIL", () => {
  const result = calculateBillingDifference({ actualChargedAmount: "-1", legalRoundedTotalVnd: "100000" });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "INVALID_ACTUAL_CHARGED_AMOUNT");
  }
});
