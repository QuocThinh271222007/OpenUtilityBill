// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { calculateMeterUsage } from "../meter/calculate-meter-usage";
import { calculateTieredElectricity } from "../electricity/calculate-tiered-electricity";
import {
  COMPETITION_ELECTRICITY_TIERS,
  COMPETITION_ELECTRICITY_VAT_RATE,
  COMPETITION_PEOPLE_PER_QUOTA_UNIT,
} from "./fixtures/competition-defaults";

/**
 * Trách nhiệm:
 * Kiểm chứng Official test case 4 — trường hợp DUY NHẤT cần GHÉP hai
 * module (calculateMeterUsage + calculateTieredElectricity) lại với
 * nhau, vì đây là ranh giới thực tế giữa "đọc chỉ số công tơ" và "tính
 * tiền điện". Hai module vẫn được unit-test ĐỘC LẬP ở nơi khác
 * (__tests__/meter/, __tests__/electricity/) — file này chỉ xác nhận
 * việc ghép hai kết quả lại đúng như luồng dữ liệu thật sẽ đi qua
 * (usage từ calculateMeterUsage được truyền thẳng làm usageKwh đầu vào
 * của calculateTieredElectricity).
 *
 * Chỉ số 5 chữ số: previous 99850, current 120, max 99999 -> usage 270
 * (rollover). Với 4 người (quota 1): subtotal 649560, VAT 51964.8,
 * exactTotal 701524.8, roundedTotalVnd 701525.
 */
test("OFFICIAL CASE 4: meter rollover (270 kWh) ghép với tính tiền điện bậc thang", () => {
  const usageResult = calculateMeterUsage({
    previousReading: "99850",
    currentReading: "120",
    meterMaximumValue: "99999",
  });
  assert.equal(usageResult.success, true);
  if (!usageResult.success) return;
  assert.equal(usageResult.data, "270");

  const electricityResult = calculateTieredElectricity({
    usageKwh: usageResult.data,
    tenantCount: 4,
    peoplePerQuotaUnit: COMPETITION_PEOPLE_PER_QUOTA_UNIT,
    vatRate: COMPETITION_ELECTRICITY_VAT_RATE,
    tiers: COMPETITION_ELECTRICITY_TIERS,
  });
  assert.equal(electricityResult.success, true);
  if (!electricityResult.success) return;

  assert.equal(electricityResult.data.appliedTiers.length, 4);
  assert.deepEqual(electricityResult.data.appliedTiers[0], {
    tierNumber: 1,
    quantityKwh: "50",
    unitPrice: "1984",
    amount: "99200",
  });
  assert.deepEqual(electricityResult.data.appliedTiers[1], {
    tierNumber: 2,
    quantityKwh: "50",
    unitPrice: "2050",
    amount: "102500",
  });
  assert.deepEqual(electricityResult.data.appliedTiers[2], {
    tierNumber: 3,
    quantityKwh: "100",
    unitPrice: "2380",
    amount: "238000",
  });
  assert.deepEqual(electricityResult.data.appliedTiers[3], {
    tierNumber: 4,
    quantityKwh: "70",
    unitPrice: "2998",
    amount: "209860",
  });
  assert.equal(electricityResult.data.subtotal, "649560");
  assert.equal(electricityResult.data.vatAmount, "51964.8");
  assert.equal(electricityResult.data.exactTotal, "701524.8");
  assert.equal(electricityResult.data.roundedTotalVnd, "701525");
});
