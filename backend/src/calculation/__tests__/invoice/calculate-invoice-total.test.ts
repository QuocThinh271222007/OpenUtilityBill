// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { calculateInvoiceTotal } from "../../invoice/calculate-invoice-total";

test("calculateInvoiceTotal: cộng chính xác rồi mới làm tròn một lần", () => {
  // electricity exactTotal có phần thập phân .4, water là số nguyên.
  // Nếu làm tròn TỪNG PHẦN trước khi cộng: round(151097.4) + round(117300)
  // = 151097 + 117300 = 268397.
  // Cách ĐÚNG (cộng trước, làm tròn sau): round(151097.4 + 117300)
  // = round(268397.4) = 268397 — cùng kết quả ở ví dụ này, nhưng bài
  // test dưới chứng minh trường hợp hai cách cho kết quả KHÁC nhau.
  const result = calculateInvoiceTotal({
    electricityExactTotal: "151097.4",
    waterExactTotal: "117300",
  });
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.exactTotal, "268397.4");
  assert.equal(result.data.roundedTotalVnd, "268397");
});

test("calculateInvoiceTotal: cộng-trước-làm-tròn-sau cho kết quả khác round-từng-phần-rồi-cộng", () => {
  // electricity = 100.3 (round riêng -> 100), water = 100.3 (round riêng -> 100).
  // Round riêng rồi cộng: 100 + 100 = 200.
  // Cộng rồi round (ĐÚNG theo quy tắc dự án): 100.3 + 100.3 = 200.6 -> 201.
  const result = calculateInvoiceTotal({
    electricityExactTotal: "100.3",
    waterExactTotal: "100.3",
  });
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.exactTotal, "200.6");
  assert.equal(result.data.roundedTotalVnd, "201");
});

test("calculateInvoiceTotal: giá trị âm -> FAIL", () => {
  const result = calculateInvoiceTotal({ electricityExactTotal: "-1", waterExactTotal: "100" });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "INVALID_DECIMAL");
  }
});
