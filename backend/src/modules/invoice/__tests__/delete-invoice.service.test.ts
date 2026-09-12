// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { DeleteInvoiceService } from "../delete-invoice.service";
import { Invoice } from "../invoice.model";
import { createFakeInvoiceRepository } from "./fakes";

/**
 * Trách nhiệm:
 * Test `DeleteInvoiceService` bằng fake `InvoiceRepository` (xem
 * `fakes.ts`) — KHÔNG PostgreSQL thật. Chứng minh: xoá thành công,
 * INVOICE_NOT_FOUND, VALIDATION_ERROR trước khi gọi Repository, và
 * invoice_items biến mất cùng invoice (qua fake mô phỏng cascade —
 * cascade THẬT được chứng minh ở integration test PostgreSQL).
 */

const BILLING_PERIOD = new Date("2026-09-01T00:00:00.000Z");

const PERSISTED_INVOICE: Invoice = {
  id: "42",
  roomId: "1",
  billingPeriod: BILLING_PERIOD,
  tenantCountUsed: 4,
  electricityTariffId: "10",
  waterTariffId: "20",
  electricityBillingMethod: "QUOTA_TIERED",
  waterBillingMethod: "PER_CUBIC_METER",
  electricityReadingId: "200",
  waterReadingId: "300",
  calculatedTotal: "366994",
  actualChargedAmount: null,
  createdAt: new Date("2026-09-10T00:00:00.000Z"),
};

test("DeleteInvoiceService: xoá invoice đang tồn tại -> thành công", async () => {
  const invoiceRepository = createFakeInvoiceRepository({ existingInvoice: PERSISTED_INVOICE });
  const service = new DeleteInvoiceService({ invoiceRepository });

  const result = await service.execute("42");

  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.id, "42");
  assert.deepEqual(invoiceRepository.deleteCalls, ["42"]);
});

test("DeleteInvoiceService: sau khi xoá, findByRoomAndPeriod không còn thấy invoice (cascade mô phỏng bằng fake)", async () => {
  const invoiceRepository = createFakeInvoiceRepository({ existingInvoice: PERSISTED_INVOICE });
  const service = new DeleteInvoiceService({ invoiceRepository });

  await service.execute("42");

  const readback = await invoiceRepository.findByRoomAndPeriod("1", BILLING_PERIOD);
  assert.equal(readback.success, true);
  if (readback.success) assert.equal(readback.data, null);
});

test("DeleteInvoiceService: invoiceId không tồn tại -> INVOICE_NOT_FOUND", async () => {
  const invoiceRepository = createFakeInvoiceRepository({ existingInvoice: null });
  const service = new DeleteInvoiceService({ invoiceRepository });

  const result = await service.execute("999");

  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "INVOICE_NOT_FOUND");
});

test("DeleteInvoiceService: invoiceId sai hình dạng -> VALIDATION_ERROR, không gọi Repository", async () => {
  const invoiceRepository = createFakeInvoiceRepository({ existingInvoice: PERSISTED_INVOICE });
  const service = new DeleteInvoiceService({ invoiceRepository });

  const result = await service.execute("not-an-id");

  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "VALIDATION_ERROR");
  assert.equal(invoiceRepository.deleteCalls.length, 0);
});

test("DeleteInvoiceService: lỗi ghi database -> propagate nguyên vẹn", async () => {
  const invoiceRepository = createFakeInvoiceRepository({
    existingInvoice: PERSISTED_INVOICE,
    deleteResult: { success: false, error: { code: "DATABASE_WRITE_FAILED", message: "lỗi giả lập" } },
  });
  const service = new DeleteInvoiceService({ invoiceRepository });

  const result = await service.execute("42");

  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "DATABASE_WRITE_FAILED");
});
