// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { GetInvoiceService } from "../get-invoice.service";
import { Invoice, InvoiceItem } from "../invoice.model";
import { createFakeInvoiceRepository } from "./fakes";

/**
 * Trách nhiệm:
 * Test `GetInvoiceService` bằng fake `InvoiceRepository` (xem
 * `fakes.ts`) — KHÔNG PostgreSQL thật, KHÔNG tính lại điện/nước (chỉ
 * đọc dữ liệu đã lưu + trừ để ra billingDifference).
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
  actualChargedAmount: "367000.12",
  createdAt: new Date("2026-09-10T00:00:00.000Z"),
};

const PERSISTED_ITEMS: InvoiceItem[] = [
  {
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
  },
  {
    id: "2",
    invoiceId: "42",
    category: "ELECTRICITY_VAT",
    tierNumber: null,
    quantity: null,
    unitName: null,
    unitPrice: null,
    amount: "19944",
    description: "VAT điện",
    displayOrder: 2,
  },
];

test("GetInvoiceService: đọc invoice đã lưu + items theo displayOrder, billingDifference tính từ giá trị đã lưu", async () => {
  const invoiceRepository = createFakeInvoiceRepository({
    existingInvoice: PERSISTED_INVOICE,
    existingItems: PERSISTED_ITEMS,
  });
  const service = new GetInvoiceService({ invoiceRepository });

  const result = await service.execute({ roomId: "1", billingPeriod: BILLING_PERIOD });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.invoice.id, "42");
  assert.deepEqual(
    result.data.items.map((i) => i.displayOrder),
    [1, 2]
  );
  // 367000.12 - 366994 = 6.12
  assert.equal(result.data.billingDifference, "6.12");
  assert.deepEqual(invoiceRepository.findItemsByInvoiceIdCalls, ["42"]);
});

test("GetInvoiceService: actualChargedAmount null trên invoice đã lưu -> billingDifference = null, KHÔNG gọi calculateBillingDifference một cách vô nghĩa", async () => {
  const invoiceRepository = createFakeInvoiceRepository({
    existingInvoice: { ...PERSISTED_INVOICE, actualChargedAmount: null },
    existingItems: PERSISTED_ITEMS,
  });
  const service = new GetInvoiceService({ invoiceRepository });

  const result = await service.execute({ roomId: "1", billingPeriod: BILLING_PERIOD });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.billingDifference, null);
});

test("GetInvoiceService: không có invoice cho (roomId, billingPeriod) -> INVOICE_NOT_FOUND, không đọc items", async () => {
  const invoiceRepository = createFakeInvoiceRepository({ existingInvoice: null });
  const service = new GetInvoiceService({ invoiceRepository });

  const result = await service.execute({ roomId: "1", billingPeriod: BILLING_PERIOD });

  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.error.code, "INVOICE_NOT_FOUND");
  assert.equal(invoiceRepository.findItemsByInvoiceIdCalls.length, 0);
});

test("GetInvoiceService: roomId không hợp lệ -> VALIDATION_ERROR, không đọc repository", async () => {
  const invoiceRepository = createFakeInvoiceRepository({ existingInvoice: PERSISTED_INVOICE, existingItems: PERSISTED_ITEMS });
  const service = new GetInvoiceService({ invoiceRepository });

  const result = await service.execute({ roomId: "not-a-bigint", billingPeriod: BILLING_PERIOD });

  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.error.code, "VALIDATION_ERROR");
});

test("GetInvoiceService: billingPeriod không phải ngày đầu tháng -> VALIDATION_ERROR", async () => {
  const invoiceRepository = createFakeInvoiceRepository({ existingInvoice: PERSISTED_INVOICE, existingItems: PERSISTED_ITEMS });
  const service = new GetInvoiceService({ invoiceRepository });

  const result = await service.execute({ roomId: "1", billingPeriod: new Date("2026-09-02T00:00:00.000Z") });

  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.error.code, "VALIDATION_ERROR");
});

test("GetInvoiceService: lỗi đọc database (findByRoomAndPeriod) -> propagate nguyên vẹn", async () => {
  const invoiceRepository = createFakeInvoiceRepository({
    existingInvoice: PERSISTED_INVOICE,
    findItemsByInvoiceIdResult: { success: false, error: { code: "DATABASE_READ_FAILED", message: "lỗi giả lập" } },
  });
  const service = new GetInvoiceService({ invoiceRepository });

  const result = await service.execute({ roomId: "1", billingPeriod: BILLING_PERIOD });

  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.error.code, "DATABASE_READ_FAILED");
});
