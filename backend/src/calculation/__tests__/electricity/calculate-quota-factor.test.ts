// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { calculateQuotaFactor, calculateQuotaFactorExact } from "../../electricity/calculate-quota-factor";
import { toDecimalString } from "../../shared/exact-number";

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

test("calculateQuotaFactor: peoplePerQuotaUnit = 3 (1/3 không hữu hạn) -> FAIL rõ ràng, không throw", () => {
  // 1/3 = 0.333... — không có biểu diễn thập phân hữu hạn. Đây là giới
  // hạn được ghi nhận có chủ đích của Chiến lược B (xem
  // calculate-quota-factor.ts và docs/NUMERIC_PRECISION.md).
  const result = calculateQuotaFactor({ tenantCount: 1, peoplePerQuotaUnit: 3 });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "INVALID_PEOPLE_PER_QUOTA_UNIT");
  }
});

test("calculateQuotaFactor: peoplePerQuotaUnit = 3 bị từ chối với MỌI tenantCount, kể cả bội số của 3", () => {
  // Trước bản sửa này, tenantCount = 3 (chia hết cho 3, thương số =
  // 1, hữu hạn) có thể "tình cờ" thành công trong khi tenantCount = 1
  // thất bại — cùng một cấu hình tariff, hành vi không nhất quán tuỳ
  // phòng. Bản sửa kiểm tra peoplePerQuotaUnit TRƯỚC, độc lập với
  // tenantCount, nên bây giờ tenantCount = 3 CŨNG bị từ chối — hành vi
  // nhất quán cho toàn bộ cấu hình, không phụ thuộc số người ở cụ thể.
  for (const tenantCount of [1, 2, 3, 6, 9]) {
    const result = calculateQuotaFactor({ tenantCount, peoplePerQuotaUnit: 3 });
    assert.equal(result.success, false, `tenantCount=${tenantCount} phải bị từ chối`);
    if (!result.success) {
      assert.equal(result.error.code, "INVALID_PEOPLE_PER_QUOTA_UNIT");
    }
  }
});

test("calculateQuotaFactor: peoplePerQuotaUnit chỉ có ước nguyên tố 2 và/hoặc 5 luôn được chấp nhận", () => {
  const cases: Array<[number, number, string]> = [
    [10, 5, "2"],
    [10, 8, "1.25"],
    [1, 25, "0.04"],
    [40, 20, "2"],
  ];
  for (const [tenantCount, peoplePerQuotaUnit, expected] of cases) {
    const result = calculateQuotaFactor({ tenantCount, peoplePerQuotaUnit });
    assert.equal(result.success, true, `tenantCount=${tenantCount}, peoplePerQuotaUnit=${peoplePerQuotaUnit}`);
    if (result.success) {
      assert.equal(result.data, expected);
    }
  }
});

test("calculateQuotaFactorExact: trả về ExactNumber trực tiếp, không cần round-trip qua chuỗi", () => {
  const result = calculateQuotaFactorExact({ tenantCount: 5, peoplePerQuotaUnit: 4 });
  assert.equal(result.success, true);
  if (result.success) {
    // ExactNumber -> chỉ chuyển sang chuỗi ở đây để so sánh trong test,
    // KHÔNG phải một bước bắt buộc trong pipeline tính toán thật.
    assert.equal(toDecimalString(result.data), "1.25");
  }
});
