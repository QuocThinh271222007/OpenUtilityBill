// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { calculateMeterUsage } from "../../meter/calculate-meter-usage";

test("calculateMeterUsage: hai chỉ số bằng nhau -> usage 0", () => {
  const result = calculateMeterUsage({ previousReading: "100", currentReading: "100", meterMaximumValue: null });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data, "0");
  }
});

test("calculateMeterUsage: chỉ số tăng bình thường", () => {
  const result = calculateMeterUsage({ previousReading: "100", currentReading: "120", meterMaximumValue: "99999" });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data, "20");
  }
});

test("calculateMeterUsage: rollover — official example (99850 -> 120, max 99999) = 270", () => {
  const result = calculateMeterUsage({ previousReading: "99850", currentReading: "120", meterMaximumValue: "99999" });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data, "270");
  }
});

test("calculateMeterUsage: rollover không có meterMaximumValue -> FAIL", () => {
  const result = calculateMeterUsage({ previousReading: "99850", currentReading: "120", meterMaximumValue: null });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "METER_MAXIMUM_REQUIRED");
  }
});

test("calculateMeterUsage: chỉ số vượt quá meterMaximumValue -> FAIL", () => {
  const result = calculateMeterUsage({ previousReading: "100", currentReading: "100000", meterMaximumValue: "99999" });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "INVALID_METER_READING");
  }
});

test("calculateMeterUsage: chỉ số âm -> FAIL", () => {
  const previousNegative = calculateMeterUsage({ previousReading: "-1", currentReading: "10", meterMaximumValue: null });
  assert.equal(previousNegative.success, false);
  if (!previousNegative.success) {
    assert.equal(previousNegative.error.code, "INVALID_METER_READING");
  }

  const currentNegative = calculateMeterUsage({ previousReading: "10", currentReading: "-1", meterMaximumValue: null });
  assert.equal(currentNegative.success, false);
  if (!currentNegative.success) {
    assert.equal(currentNegative.error.code, "INVALID_METER_READING");
  }
});

test("calculateMeterUsage: meterMaximumValue <= 0 -> FAIL", () => {
  const result = calculateMeterUsage({ previousReading: "10", currentReading: "20", meterMaximumValue: "0" });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "INVALID_METER_MAXIMUM");
  }
});

test("calculateMeterUsage: chuỗi không hợp lệ -> FAIL", () => {
  const result = calculateMeterUsage({ previousReading: "abc", currentReading: "20", meterMaximumValue: null });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "INVALID_METER_READING");
  }
});
