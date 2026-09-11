// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import {
  ONE,
  ZERO,
  add,
  compare,
  divide,
  isFiniteDecimalDenominator,
  min,
  multiply,
  parseDecimal,
  roundHalfUpToInteger,
  subtract,
  toDecimalString,
} from "../../shared/exact-number";

test("parseDecimal: số nguyên và số thập phân hợp lệ", () => {
  const zero = parseDecimal("0");
  assert.equal(zero.success, true);

  const wholeNumber = parseDecimal("50");
  assert.equal(wholeNumber.success, true);
  if (wholeNumber.success) {
    assert.equal(toDecimalString(wholeNumber.data), "50");
  }

  const decimal = parseDecimal("62.5");
  assert.equal(decimal.success, true);
  if (decimal.success) {
    assert.equal(toDecimalString(decimal.data), "62.5");
  }

  const negative = parseDecimal("-12.3");
  assert.equal(negative.success, true);
  if (negative.success) {
    assert.equal(toDecimalString(negative.data), "-12.3");
  }
});

test("parseDecimal: chuỗi không hợp lệ bị từ chối", () => {
  for (const invalid of ["", "-", ".5", "5.", "1.2.3", "abc", " 5", "5 ", "+5", "1e10"]) {
    const result = parseDecimal(invalid);
    assert.equal(result.success, false, `Kỳ vọng "${invalid}" bị từ chối`);
    if (!result.success) {
      assert.equal(result.error.code, "INVALID_DECIMAL");
    }
  }
});

test("add/subtract/multiply: chính xác tuyệt đối, không sai số dấu phẩy động", () => {
  const zeroPointOne = parseDecimal("0.1");
  const zeroPointTwo = parseDecimal("0.2");
  assert.equal(zeroPointOne.success, true);
  assert.equal(zeroPointTwo.success, true);
  if (zeroPointOne.success && zeroPointTwo.success) {
    const sum = add(zeroPointOne.data, zeroPointTwo.data);
    // Đây chính là trường hợp 0.1 + 0.2 !== 0.3 nếu dùng JavaScript
    // number — ExactNumber phải cho đúng "0.3" tuyệt đối.
    assert.equal(toDecimalString(sum), "0.3");
  }

  const sixtyTwoPointFive = parseDecimal("62.5");
  const nineteenEightyFour = parseDecimal("1984");
  assert.equal(sixtyTwoPointFive.success, true);
  assert.equal(nineteenEightyFour.success, true);
  if (sixtyTwoPointFive.success && nineteenEightyFour.success) {
    const product = multiply(sixtyTwoPointFive.data, nineteenEightyFour.data);
    assert.equal(toDecimalString(product), "124000");
  }

  const oneHundredThirtyNineThousandNineHundredFive = parseDecimal("139905");
  const eightPercent = parseDecimal("0.08");
  assert.equal(oneHundredThirtyNineThousandNineHundredFive.success, true);
  assert.equal(eightPercent.success, true);
  if (oneHundredThirtyNineThousandNineHundredFive.success && eightPercent.success) {
    const vat = multiply(oneHundredThirtyNineThousandNineHundredFive.data, eightPercent.data);
    assert.equal(toDecimalString(vat), "11192.4");
  }

  const five = parseDecimal("5");
  const three = parseDecimal("3");
  assert.equal(five.success, true);
  assert.equal(three.success, true);
  if (five.success && three.success) {
    assert.equal(toDecimalString(subtract(five.data, three.data)), "2");
  }
});

test("compare/min", () => {
  const a = parseDecimal("12.5");
  const b = parseDecimal("20");
  assert.equal(a.success, true);
  assert.equal(b.success, true);
  if (a.success && b.success) {
    assert.equal(compare(a.data, b.data), -1);
    assert.equal(compare(b.data, a.data), 1);
    assert.equal(compare(a.data, a.data), 0);
    assert.equal(toDecimalString(min(a.data, b.data)), "12.5");
  }
});

test("divide: chia cho 0 trả về lỗi thay vì throw/Infinity", () => {
  const result = divide(ONE, ZERO);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "DIVISION_BY_ZERO");
  }
});

test("divide: 1/4 = 0.25", () => {
  const one = parseDecimal("1");
  const four = parseDecimal("4");
  assert.equal(one.success, true);
  assert.equal(four.success, true);
  if (one.success && four.success) {
    const result = divide(one.data, four.data);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(toDecimalString(result.data), "0.25");
    }
  }
});

test("toDecimalString: không có số 0 thừa ở cuối", () => {
  const value = parseDecimal("19944.00");
  assert.equal(value.success, true);
  if (value.success) {
    assert.equal(toDecimalString(value.data), "19944");
  }

  const decimalValue = parseDecimal("62.500");
  assert.equal(decimalValue.success, true);
  if (decimalValue.success) {
    assert.equal(toDecimalString(decimalValue.data), "62.5");
  }
});

test("roundHalfUpToInteger: half-up đúng ba mốc .4 / .5 / .6", () => {
  const below = parseDecimal("151096.4");
  const exact = parseDecimal("151096.5");
  const above = parseDecimal("151096.6");
  assert.equal(below.success, true);
  assert.equal(exact.success, true);
  assert.equal(above.success, true);
  if (below.success && exact.success && above.success) {
    assert.equal(roundHalfUpToInteger(below.data), 151096n);
    assert.equal(roundHalfUpToInteger(exact.data), 151097n);
    assert.equal(roundHalfUpToInteger(above.data), 151097n);
  }
});

test("roundHalfUpToInteger: trường hợp chính thức 151097.4 -> 151097", () => {
  const value = parseDecimal("151097.4");
  assert.equal(value.success, true);
  if (value.success) {
    assert.equal(roundHalfUpToInteger(value.data), 151097n);
  }
});

test("multiply: 50.01 * 1.25 = 62.5125 — giữ đúng 4 chữ số thập phân, không làm tròn", () => {
  const threshold = parseDecimal("50.01");
  const quota = parseDecimal("1.25");
  assert.equal(threshold.success, true);
  assert.equal(quota.success, true);
  if (threshold.success && quota.success) {
    assert.equal(toDecimalString(multiply(threshold.data, quota.data)), "62.5125");
  }
});

test("isFiniteDecimalDenominator: chỉ đúng khi ước nguyên tố là 2 và/hoặc 5", () => {
  for (const value of [1n, 2n, 4n, 5n, 8n, 10n, 16n, 20n, 25n, 40n, 50n]) {
    assert.equal(isFiniteDecimalDenominator(value), true, `${value} phải hữu hạn`);
  }
  for (const value of [3n, 6n, 7n, 9n, 11n, 12n, 15n]) {
    assert.equal(isFiniteDecimalDenominator(value), false, `${value} không được hữu hạn`);
  }
  assert.equal(isFiniteDecimalDenominator(0n), false);
  assert.equal(isFiniteDecimalDenominator(-4n), false);
});
