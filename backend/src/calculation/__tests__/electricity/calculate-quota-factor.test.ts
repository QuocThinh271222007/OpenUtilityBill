// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { calculateQuotaFactor } from "../../electricity/calculate-quota-factor";

test("calculateQuotaFactor: các mốc chính thức với peoplePerQuotaUnit = 4", () => {
  const cases: Array<[number, string]> = [
    [1, "0.25"],
    [2, "0.5"],
    [3, "0.75"],
    [4, "1"],
    [5, "1.25"],
  ];
  for (const [tenantCount, expected] of cases) {
    const result = calculateQuotaFactor({ tenantCount, peoplePerQuotaUnit: 4 });
    assert.equal(result.success, true, `tenantCount=${tenantCount}`);
    if (result.success) {
      assert.equal(result.data, expected, `tenantCount=${tenantCount}`);
    }
  }
});

test("calculateQuotaFactor: peoplePerQuotaUnit không phải hằng số cứng — thử giá trị khác 4", () => {
  const result = calculateQuotaFactor({ tenantCount: 6, peoplePerQuotaUnit: 2 });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data, "3");
  }
});

test("calculateQuotaFactor: tenantCount = 0 -> FAIL (đề thi không định nghĩa quy tắc 0 người)", () => {
  const result = calculateQuotaFactor({ tenantCount: 0, peoplePerQuotaUnit: 4 });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "INVALID_TENANT_COUNT");
  }
});

test("calculateQuotaFactor: tenantCount âm -> FAIL", () => {
  const result = calculateQuotaFactor({ tenantCount: -1, peoplePerQuotaUnit: 4 });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "INVALID_TENANT_COUNT");
  }
});

test("calculateQuotaFactor: peoplePerQuotaUnit <= 0 -> FAIL", () => {
  const zero = calculateQuotaFactor({ tenantCount: 4, peoplePerQuotaUnit: 0 });
  assert.equal(zero.success, false);
  if (!zero.success) {
    assert.equal(zero.error.code, "INVALID_PEOPLE_PER_QUOTA_UNIT");
  }

  const negative = calculateQuotaFactor({ tenantCount: 4, peoplePerQuotaUnit: -2 });
  assert.equal(negative.success, false);
  if (!negative.success) {
    assert.equal(negative.error.code, "INVALID_PEOPLE_PER_QUOTA_UNIT");
  }
});

test("calculateQuotaFactor: thương số không kết thúc hữu hạn -> FAIL rõ ràng, không throw", () => {
  // 1/3 = 0.333... — không có biểu diễn thập phân hữu hạn. Đây là giới
  // hạn được ghi nhận có chủ đích của phiên bản hiện tại (xem
  // shared/exact-number.ts và docs/NUMERIC_PRECISION.md).
  const result = calculateQuotaFactor({ tenantCount: 1, peoplePerQuotaUnit: 3 });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "INVALID_PEOPLE_PER_QUOTA_UNIT");
  }
});
