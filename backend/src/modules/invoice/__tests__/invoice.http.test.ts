// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import {
  formatDateAsWireDate,
  mapResultErrorCodeToHttpStatus,
  parseBillingPeriodWireFormat,
  serializeInvoice,
  serializeInvoiceItem,
} from "../invoice.http";
import { Invoice, InvoiceItem } from "../invoice.model";

test("parseBillingPeriodWireFormat: 'YYYY-MM-DD' hợp lệ -> Date UTC-midnight", () => {
  const result = parseBillingPeriodWireFormat("2026-09-01");
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.toISOString(), "2026-09-01T00:00:00.000Z");
});

test("parseBillingPeriodWireFormat: không phải string -> VALIDATION_ERROR", () => {
  const result = parseBillingPeriodWireFormat(undefined);
  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.error.code, "VALIDATION_ERROR");
});

test("parseBillingPeriodWireFormat: sai hình dạng '2026-9-1' -> VALIDATION_ERROR", () => {
  const result = parseBillingPeriodWireFormat("2026-9-1");
  assert.equal(result.success, false);
});

test("parseBillingPeriodWireFormat: day khác 01 ('2026-09-02') -> VALIDATION_ERROR", () => {
  const result = parseBillingPeriodWireFormat("2026-09-02");
  assert.equal(result.success, false);
});

test("parseBillingPeriodWireFormat: ngày lịch không tồn tại ('2026-02-30') -> VALIDATION_ERROR", () => {
  const result = parseBillingPeriodWireFormat("2026-02-30");
  assert.equal(result.success, false);
});

test("parseBillingPeriodWireFormat: có phần giờ/múi giờ ('2026-09-01T10:00:00Z') -> VALIDATION_ERROR", () => {
  const result = parseBillingPeriodWireFormat("2026-09-01T10:00:00Z");
  assert.equal(result.success, false);
});

test("formatDateAsWireDate: UTC-midnight Date -> 'YYYY-MM-DD'", () => {
  assert.equal(formatDateAsWireDate(new Date("2026-09-01T00:00:00.000Z")), "2026-09-01");
});

test("mapResultErrorCodeToHttpStatus: các mã đã biết ánh xạ đúng status", () => {
  assert.equal(mapResultErrorCodeToHttpStatus("VALIDATION_ERROR"), 400);
  assert.equal(mapResultErrorCodeToHttpStatus("INVALID_ACTUAL_CHARGED_AMOUNT"), 400);
  assert.equal(mapResultErrorCodeToHttpStatus("ROOM_NOT_FOUND"), 404);
  assert.equal(mapResultErrorCodeToHttpStatus("METER_READING_NOT_FOUND"), 404);
  assert.equal(mapResultErrorCodeToHttpStatus("TARIFF_NOT_FOUND"), 404);
  assert.equal(mapResultErrorCodeToHttpStatus("INVOICE_NOT_FOUND"), 404);
  assert.equal(mapResultErrorCodeToHttpStatus("INVOICE_ALREADY_EXISTS"), 409);
  assert.equal(mapResultErrorCodeToHttpStatus("AMBIGUOUS_TARIFF_CONFIGURATION"), 422);
  assert.equal(mapResultErrorCodeToHttpStatus("FALLBACK_TIER_NOT_FOUND"), 422);
  assert.equal(mapResultErrorCodeToHttpStatus("INVALID_DECIMAL"), 422);
  assert.equal(mapResultErrorCodeToHttpStatus("DATABASE_READ_FAILED"), 500);
  assert.equal(mapResultErrorCodeToHttpStatus("DATABASE_WRITE_FAILED"), 500);
  assert.equal(mapResultErrorCodeToHttpStatus("TRANSACTION_FAILED"), 500);
  assert.equal(mapResultErrorCodeToHttpStatus("INTERNAL_INVARIANT_VIOLATION"), 500);
});

test("mapResultErrorCodeToHttpStatus: mã không nằm trong bảng -> 500 (không đoán 4xx)", () => {
  assert.equal(mapResultErrorCodeToHttpStatus("SOME_UNKNOWN_CODE_NEVER_SEEN"), 500);
});

const SAMPLE_INVOICE: Invoice = {
  id: "42",
  roomId: "1",
  billingPeriod: new Date("2026-09-01T00:00:00.000Z"),
  tenantCountUsed: 4,
  electricityTariffId: "10",
  waterTariffId: "20",
  electricityBillingMethod: "QUOTA_TIERED",
  waterBillingMethod: "PER_CUBIC_METER",
  electricityReadingId: "200",
  waterReadingId: "300",
  calculatedTotal: "366994.00",
  actualChargedAmount: "367000.12",
  createdAt: new Date("2026-09-10T12:34:56.000Z"),
};

test("serializeInvoice: billingPeriod -> 'YYYY-MM-DD', createdAt -> ISO-8601 đầy đủ, số tiền giữ nguyên chuỗi persisted (không canonicalize)", () => {
  const serialized = serializeInvoice(SAMPLE_INVOICE);
  assert.equal(serialized.billingPeriod, "2026-09-01");
  assert.equal(serialized.createdAt, "2026-09-10T12:34:56.000Z");
  assert.equal(serialized.calculatedTotal, "366994.00");
  assert.equal(serialized.actualChargedAmount, "367000.12");
  assert.equal(typeof serialized.id, "string");
  assert.equal(JSON.stringify(serialized).includes("366994.00"), true);
});

const SAMPLE_ITEM: InvoiceItem = {
  id: "1",
  invoiceId: "42",
  category: "ELECTRICITY_TIER",
  tierNumber: 1,
  quantity: "50",
  unitName: "kWh",
  unitPrice: "1984",
  amount: "99200",
  description: "Bậc điện 1",
  displayOrder: 1,
};

test("serializeInvoiceItem: JSON-safe, không có Date/bigint", () => {
  const serialized = serializeInvoiceItem(SAMPLE_ITEM);
  // Phải JSON.stringify được (không bigint) — nếu bigint sẽ throw TypeError.
  assert.doesNotThrow(() => JSON.stringify(serialized));
  assert.equal(serialized.amount, "99200");
});
