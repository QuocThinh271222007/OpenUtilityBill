// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { validateElectricityConfig } from "../../electricity/validate-electricity-config";
import { COMPETITION_ELECTRICITY_TIERS } from "../fixtures/competition-defaults";

test("validateElectricityConfig: cấu hình 6 bậc mặc định hợp lệ", () => {
  const result = validateElectricityConfig(COMPETITION_ELECTRICITY_TIERS);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.length, 6);
    assert.equal(result.data[5].thresholdKwh, null);
  }
});

test("validateElectricityConfig: tariff động với 3 bậc (khác 6) vẫn hợp lệ", () => {
  const result = validateElectricityConfig([
    { tierNumber: 1, thresholdKwh: "100", unitPrice: "1000" },
    { tierNumber: 2, thresholdKwh: "100", unitPrice: "1500" },
    { tierNumber: 3, thresholdKwh: null, unitPrice: "2000" },
  ]);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.length, 3);
  }
});

test("validateElectricityConfig: đầu vào không theo thứ tự vẫn được sắp xếp xác định", () => {
  const result = validateElectricityConfig([
    { tierNumber: 3, thresholdKwh: null, unitPrice: "2000" },
    { tierNumber: 1, thresholdKwh: "100", unitPrice: "1000" },
    { tierNumber: 2, thresholdKwh: "100", unitPrice: "1500" },
  ]);
  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(
      result.data.map((tier) => tier.tierNumber),
      [1, 2, 3]
    );
  }
});

test("validateElectricityConfig: danh sách rỗng -> FAIL", () => {
  const result = validateElectricityConfig([]);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "EMPTY_TARIFF");
  }
});

test("validateElectricityConfig: tierNumber trùng lặp -> FAIL", () => {
  const result = validateElectricityConfig([
    { tierNumber: 1, thresholdKwh: "100", unitPrice: "1000" },
    { tierNumber: 1, thresholdKwh: null, unitPrice: "2000" },
  ]);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "DUPLICATE_TIER_NUMBER");
  }
});

test("validateElectricityConfig: không có bậc không giới hạn -> FAIL", () => {
  const result = validateElectricityConfig([
    { tierNumber: 1, thresholdKwh: "100", unitPrice: "1000" },
    { tierNumber: 2, thresholdKwh: "100", unitPrice: "1500" },
  ]);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "NO_UNLIMITED_TIER");
  }
});

test("validateElectricityConfig: nhiều hơn một bậc không giới hạn -> FAIL", () => {
  const result = validateElectricityConfig([
    { tierNumber: 1, thresholdKwh: null, unitPrice: "1000" },
    { tierNumber: 2, thresholdKwh: null, unitPrice: "1500" },
  ]);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "MULTIPLE_UNLIMITED_TIERS");
  }
});

test("validateElectricityConfig: bậc không giới hạn không phải bậc cuối -> FAIL", () => {
  const result = validateElectricityConfig([
    { tierNumber: 1, thresholdKwh: null, unitPrice: "1000" },
    { tierNumber: 2, thresholdKwh: "100", unitPrice: "1500" },
  ]);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "UNLIMITED_TIER_NOT_LAST");
  }
});

test("validateElectricityConfig: tierNumber không hợp lệ -> FAIL", () => {
  const result = validateElectricityConfig([{ tierNumber: 0, thresholdKwh: null, unitPrice: "1000" }]);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "INVALID_TIER_NUMBER");
  }
});

test("validateElectricityConfig: thresholdKwh = 0 -> FAIL", () => {
  const result = validateElectricityConfig([
    { tierNumber: 1, thresholdKwh: "0", unitPrice: "1000" },
    { tierNumber: 2, thresholdKwh: null, unitPrice: "1500" },
  ]);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "INVALID_TIER_THRESHOLD");
  }
});

test("validateElectricityConfig: unitPrice âm -> FAIL", () => {
  const result = validateElectricityConfig([{ tierNumber: 1, thresholdKwh: null, unitPrice: "-1" }]);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "INVALID_TIER_PRICE");
  }
});

test("validateElectricityConfig: unitPrice = 0 hợp lệ (>= 0)", () => {
  const result = validateElectricityConfig([{ tierNumber: 1, thresholdKwh: null, unitPrice: "0" }]);
  assert.equal(result.success, true);
});
