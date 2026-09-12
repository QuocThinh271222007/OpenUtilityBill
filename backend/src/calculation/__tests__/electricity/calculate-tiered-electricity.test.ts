// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { calculateTieredElectricity } from "../../electricity/calculate-tiered-electricity";
import { DEFAULT_ELECTRICITY_TIERS, DEFAULT_ELECTRICITY_VAT_RATE, DEFAULT_PEOPLE_PER_QUOTA_UNIT } from "../fixtures/default-tariffs";

/**
 * Reference test case 1: 4 người, 120 kWh, quota = 1.
 *
 * Bậc 1: 50 * 1984 = 99200
 * Bậc 2: 50 * 2050 = 102500
 * Bậc 3: 20 * 2380 = 47600
 * subtotal = 249300, VAT 8% = 19944, total = 269244.
 */
test("REFERENCE CASE 1: 4 người, 120 kWh, quota 1", () => {
  const result = calculateTieredElectricity({
    usageKwh: "120",
    tenantCount: 4,
    peoplePerQuotaUnit: DEFAULT_PEOPLE_PER_QUOTA_UNIT,
    vatRate: DEFAULT_ELECTRICITY_VAT_RATE,
    tiers: DEFAULT_ELECTRICITY_TIERS,
  });
  assert.equal(result.success, true);
  if (!result.success) return;

  assert.equal(result.data.quotaFactor, "1");
  assert.equal(result.data.appliedTiers.length, 3);
  assert.deepEqual(result.data.appliedTiers[0], { tierNumber: 1, quantityKwh: "50", unitPrice: "1984", amount: "99200" });
  assert.deepEqual(result.data.appliedTiers[1], { tierNumber: 2, quantityKwh: "50", unitPrice: "2050", amount: "102500" });
  assert.deepEqual(result.data.appliedTiers[2], { tierNumber: 3, quantityKwh: "20", unitPrice: "2380", amount: "47600" });
  assert.equal(result.data.subtotal, "249300");
  assert.equal(result.data.vatAmount, "19944");
  assert.equal(result.data.exactTotal, "269244");
  assert.equal(result.data.roundedTotalVnd, "269244");
});

/**
 * Reference test case 2: 5 người, 200 kWh, quota = 1.25.
 *
 * Ngưỡng đã điều chỉnh: 62.5 / 62.5 / 125 / 125 / 125 / unlimited.
 * Bậc 1: 62.5 * 1984 = 124000
 * Bậc 2: 62.5 * 2050 = 128125
 * Bậc 3: 75 * 2380  = 178500
 * subtotal = 430625, VAT = 34450, total = 465075.
 *
 * Test này chứng minh ngưỡng 62.5 KHÔNG bị làm tròn.
 */
test("REFERENCE CASE 2: 5 người, 200 kWh, quota 1.25 — không làm tròn ngưỡng", () => {
  const result = calculateTieredElectricity({
    usageKwh: "200",
    tenantCount: 5,
    peoplePerQuotaUnit: DEFAULT_PEOPLE_PER_QUOTA_UNIT,
    vatRate: DEFAULT_ELECTRICITY_VAT_RATE,
    tiers: DEFAULT_ELECTRICITY_TIERS,
  });
  assert.equal(result.success, true);
  if (!result.success) return;

  assert.equal(result.data.quotaFactor, "1.25");
  assert.deepEqual(result.data.appliedTiers[0], { tierNumber: 1, quantityKwh: "62.5", unitPrice: "1984", amount: "124000" });
  assert.deepEqual(result.data.appliedTiers[1], { tierNumber: 2, quantityKwh: "62.5", unitPrice: "2050", amount: "128125" });
  assert.deepEqual(result.data.appliedTiers[2], { tierNumber: 3, quantityKwh: "75", unitPrice: "2380", amount: "178500" });
  assert.equal(result.data.subtotal, "430625");
  assert.equal(result.data.vatAmount, "34450");
  assert.equal(result.data.exactTotal, "465075");
  assert.equal(result.data.roundedTotalVnd, "465075");
});

/**
 * Reference test case 3: 1 người, 60 kWh, quota = 0.25.
 *
 * Ngưỡng: 12.5 / 12.5 / 25 / 25 / 25 / unlimited.
 * Bậc 1: 12.5 * 1984 = 24800
 * Bậc 2: 12.5 * 2050 = 25625
 * Bậc 3: 25 * 2380   = 59500
 * Bậc 4: 10 * 2998   = 29980
 * subtotal = 139905, VAT 8% = 11192.4, exactTotal = 151097.4,
 * roundedTotalVnd (half-up) = 151097.
 *
 * Test này chứng minh độ chính xác thập phân trung gian (11192.4 không
 * bị làm tròn trước khi cộng vào subtotal).
 */
test("REFERENCE CASE 3: 1 người, 60 kWh, quota 0.25 — độ chính xác thập phân trung gian", () => {
  const result = calculateTieredElectricity({
    usageKwh: "60",
    tenantCount: 1,
    peoplePerQuotaUnit: DEFAULT_PEOPLE_PER_QUOTA_UNIT,
    vatRate: DEFAULT_ELECTRICITY_VAT_RATE,
    tiers: DEFAULT_ELECTRICITY_TIERS,
  });
  assert.equal(result.success, true);
  if (!result.success) return;

  assert.equal(result.data.quotaFactor, "0.25");
  assert.equal(result.data.appliedTiers.length, 4);
  assert.deepEqual(result.data.appliedTiers[0], { tierNumber: 1, quantityKwh: "12.5", unitPrice: "1984", amount: "24800" });
  assert.deepEqual(result.data.appliedTiers[1], { tierNumber: 2, quantityKwh: "12.5", unitPrice: "2050", amount: "25625" });
  assert.deepEqual(result.data.appliedTiers[2], { tierNumber: 3, quantityKwh: "25", unitPrice: "2380", amount: "59500" });
  assert.deepEqual(result.data.appliedTiers[3], { tierNumber: 4, quantityKwh: "10", unitPrice: "2998", amount: "29980" });
  assert.equal(result.data.subtotal, "139905");
  assert.equal(result.data.vatAmount, "11192.4");
  assert.equal(result.data.exactTotal, "151097.4");
  assert.equal(result.data.roundedTotalVnd, "151097");
});

test("calculateTieredElectricity: usage = 0 -> subtotal 0, không có bậc áp dụng", () => {
  const result = calculateTieredElectricity({
    usageKwh: "0",
    tenantCount: 4,
    peoplePerQuotaUnit: DEFAULT_PEOPLE_PER_QUOTA_UNIT,
    vatRate: DEFAULT_ELECTRICITY_VAT_RATE,
    tiers: DEFAULT_ELECTRICITY_TIERS,
  });
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(result.data.appliedTiers, []);
  assert.equal(result.data.subtotal, "0");
  assert.equal(result.data.roundedTotalVnd, "0");
});

test("calculateTieredElectricity: tariff động 3 bậc (khác 6) vẫn tính đúng", () => {
  const result = calculateTieredElectricity({
    usageKwh: "150",
    tenantCount: 4,
    peoplePerQuotaUnit: 4,
    vatRate: "0.1",
    tiers: [
      { tierNumber: 1, thresholdKwh: "100", unitPrice: "2000" },
      { tierNumber: 2, thresholdKwh: null, unitPrice: "3000" },
    ],
  });
  assert.equal(result.success, true);
  if (!result.success) return;
  // 100 * 2000 + 50 * 3000 = 200000 + 150000 = 350000
  assert.equal(result.data.subtotal, "350000");
  assert.equal(result.data.vatAmount, "35000");
  assert.equal(result.data.roundedTotalVnd, "385000");
});

test("calculateTieredElectricity: vatRate ngoài [0, 1] -> FAIL", () => {
  const result = calculateTieredElectricity({
    usageKwh: "10",
    tenantCount: 4,
    peoplePerQuotaUnit: 4,
    vatRate: "1.5",
    tiers: DEFAULT_ELECTRICITY_TIERS,
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "INVALID_VAT_RATE");
  }
});

test("calculateTieredElectricity: ngưỡng bậc không phải số nguyên (50.01) vẫn giữ chính xác tuyệt đối sau khi nhân quota", () => {
  // 5 người, peoplePerQuotaUnit 4 -> quota = 1.25. Ngưỡng gốc 50.01,
  // điều chỉnh: 50.01 * 1.25 = 62.5125 — PHẢI giữ đúng 4 chữ số thập
  // phân, không bị làm tròn về 62.51 hay 62.5 ở bất kỳ bước nào. Đây là
  // ví dụ chính xác được nêu trong migration
  // database/migrations/002_preserve_invoice_item_precision.sql.
  const result = calculateTieredElectricity({
    usageKwh: "62.5125",
    tenantCount: 5,
    peoplePerQuotaUnit: 4,
    vatRate: "0",
    tiers: [
      { tierNumber: 1, thresholdKwh: "50.01", unitPrice: "1984" },
      { tierNumber: 2, thresholdKwh: null, unitPrice: "2000" },
    ],
  });
  assert.equal(result.success, true);
  if (!result.success) return;

  assert.equal(result.data.quotaFactor, "1.25");
  assert.equal(result.data.appliedTiers.length, 1);
  assert.equal(result.data.appliedTiers[0].quantityKwh, "62.5125");
  // 62.5125 * 1984 = 124024.8 — tính đúng bằng tay, xem test này và
  // docs/NUMERIC_PRECISION.md.
  assert.equal(result.data.appliedTiers[0].amount, "124024.8");
  assert.equal(result.data.subtotal, "124024.8");
});

test("calculateTieredElectricity: tenantCount = 0 -> FAIL (uỷ quyền cho calculateQuotaFactor)", () => {
  const result = calculateTieredElectricity({
    usageKwh: "10",
    tenantCount: 0,
    peoplePerQuotaUnit: 4,
    vatRate: "0.08",
    tiers: DEFAULT_ELECTRICITY_TIERS,
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "INVALID_TENANT_COUNT");
  }
});
