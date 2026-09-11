// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { PostgresInvoiceRepository, __testing } from "../postgres/postgres-invoice.repository";
import type { DatabaseExecutor } from "../../database/database.types";
import type { NewInvoice, NewInvoiceItem } from "../invoice.repository";

test("mapInvoiceRow: ánh xạ đúng, actualChargedAmount NULL giữ nguyên null", () => {
  const row = {
    id: "1",
    room_id: "1",
    billing_period: new Date("2026-09-01T00:00:00.000Z"),
    tenant_count_used: 4,
    electricity_tariff_id: "1",
    water_tariff_id: "1",
    electricity_billing_method: "QUOTA_TIERED" as const,
    water_billing_method: "PER_PERSON" as const,
    electricity_reading_id: "10",
    water_reading_id: null,
    calculated_total: "269244",
    actual_charged_amount: null,
    created_at: new Date("2026-09-05T00:00:00.000Z"),
  };
  const invoice = __testing.mapInvoiceRow(row);
  assert.equal(invoice.calculatedTotal, "269244");
  assert.equal(invoice.actualChargedAmount, null);
  assert.equal(invoice.waterReadingId, null);
  assert.equal(typeof invoice.id, "string");
});

function createEmptyResultExecutor(): DatabaseExecutor {
  const fn = async () => [];
  return fn as unknown as DatabaseExecutor;
}

test("findByRoomAndPeriod: không có invoice -> Result THÀNH CÔNG với data = null (không phải lỗi)", async () => {
  const repository = new PostgresInvoiceRepository(createEmptyResultExecutor());
  const result = await repository.findByRoomAndPeriod("1", new Date("2026-09-01"));
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data, null);
  }
});

function createThrowingExecutor(errorToThrow: Error): DatabaseExecutor {
  const fn = async () => {
    throw errorToThrow;
  };
  return fn as unknown as DatabaseExecutor;
}

test("findByRoomAndPeriod: lỗi database -> DATABASE_READ_FAILED", async () => {
  const repository = new PostgresInvoiceRepository(createThrowingExecutor(new Error("timeout")));
  const result = await repository.findByRoomAndPeriod("1", new Date("2026-09-01"));
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "DATABASE_READ_FAILED");
  }
});

test("mapInvoiceItemRow: ánh xạ đúng, quantity/unitName/unitPrice NULL giữ nguyên null", () => {
  const row = {
    id: "5",
    invoice_id: "1",
    category: "ELECTRICITY_VAT" as const,
    tier_number: null,
    quantity: null,
    unit_name: null,
    unit_price: null,
    amount: "21540.9600",
    description: "VAT điện",
    display_order: 7,
  };
  const item = __testing.mapInvoiceItemRow(row);
  assert.deepEqual(item, {
    id: "5",
    invoiceId: "1",
    category: "ELECTRICITY_VAT",
    tierNumber: null,
    quantity: null,
    unitName: null,
    unitPrice: null,
    amount: "21540.9600",
    description: "VAT điện",
    displayOrder: 7,
  });
});

function sampleNewInvoice(): NewInvoice {
  return {
    roomId: "1",
    billingPeriod: new Date("2026-09-01T00:00:00.000Z"),
    tenantCountUsed: 4,
    electricityTariffId: "1",
    waterTariffId: "1",
    electricityBillingMethod: "QUOTA_TIERED",
    waterBillingMethod: "PER_PERSON",
    electricityReadingId: "10",
    waterReadingId: null,
    calculatedTotal: "269244",
    actualChargedAmount: null,
  };
}

function createRowResultExecutor(rows: unknown[]): DatabaseExecutor {
  const fn = async () => rows;
  return fn as unknown as DatabaseExecutor;
}

test("createInvoice: thành công -> ánh xạ đúng row từ RETURNING", async () => {
  const returnedRow = {
    id: "42",
    room_id: "1",
    billing_period: new Date("2026-09-01T00:00:00.000Z"),
    tenant_count_used: 4,
    electricity_tariff_id: "1",
    water_tariff_id: "1",
    electricity_billing_method: "QUOTA_TIERED" as const,
    water_billing_method: "PER_PERSON" as const,
    electricity_reading_id: "10",
    water_reading_id: null,
    calculated_total: "269244",
    actual_charged_amount: null,
    created_at: new Date("2026-09-10T00:00:00.000Z"),
  };
  const repository = new PostgresInvoiceRepository(createRowResultExecutor([returnedRow]));
  const result = await repository.createInvoice(sampleNewInvoice());
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.id, "42");
    assert.equal(result.data.calculatedTotal, "269244");
    assert.equal(result.data.waterReadingId, null);
  }
});

test("createInvoice: vi phạm UNIQUE(room_id, billing_period) (SQLSTATE 23505) -> INVOICE_ALREADY_EXISTS", async () => {
  const uniqueViolationError = Object.assign(new Error("duplicate key value violates unique constraint"), {
    code: "23505",
  });
  const repository = new PostgresInvoiceRepository(createThrowingExecutor(uniqueViolationError));
  const result = await repository.createInvoice(sampleNewInvoice());
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "INVOICE_ALREADY_EXISTS");
    // Không lộ message PostgreSQL gốc.
    assert.equal(result.error.message.includes("constraint"), false);
  }
});

test("createInvoice: lỗi ghi khác (không phải 23505) -> DATABASE_WRITE_FAILED", async () => {
  const genericError = Object.assign(new Error("connection terminated"), { code: "57P01" });
  const repository = new PostgresInvoiceRepository(createThrowingExecutor(genericError));
  const result = await repository.createInvoice(sampleNewInvoice());
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "DATABASE_WRITE_FAILED");
  }
});

function sampleNewInvoiceItems(): NewInvoiceItem[] {
  return [
    {
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
      category: "ELECTRICITY_VAT",
      tierNumber: null,
      quantity: null,
      unitName: null,
      unitPrice: null,
      amount: "7936",
      description: "VAT điện",
      displayOrder: 2,
    },
  ];
}

test("createInvoiceItems: thành công -> chèn TỪNG dòng, trả về đúng số lượng theo thứ tự", async () => {
  const items = sampleNewInvoiceItems();
  let callCount = 0;
  const fn = async () => {
    callCount += 1;
    const item = items[callCount - 1];
    return [
      {
        id: String(callCount),
        invoice_id: "42",
        category: item.category,
        tier_number: item.tierNumber,
        quantity: item.quantity,
        unit_name: item.unitName,
        unit_price: item.unitPrice,
        amount: item.amount,
        description: item.description,
        display_order: item.displayOrder,
      },
    ];
  };
  const repository = new PostgresInvoiceRepository(fn as unknown as DatabaseExecutor);
  const result = await repository.createInvoiceItems("42", items);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.length, 2);
    assert.equal(callCount, 2);
    assert.deepEqual(
      result.data.map((item) => item.displayOrder),
      [1, 2]
    );
    assert.equal(result.data[0].invoiceId, "42");
  }
});

test("createInvoiceItems: lỗi ghi -> DATABASE_WRITE_FAILED", async () => {
  const repository = new PostgresInvoiceRepository(createThrowingExecutor(new Error("write failed")));
  const result = await repository.createInvoiceItems("42", sampleNewInvoiceItems());
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "DATABASE_WRITE_FAILED");
  }
});

test("__testing.isUniqueViolation: nhận diện đúng SQLSTATE 23505, từ chối lỗi khác/không phải object", () => {
  assert.equal(__testing.isUniqueViolation(Object.assign(new Error("x"), { code: "23505" })), true);
  assert.equal(__testing.isUniqueViolation(Object.assign(new Error("x"), { code: "23503" })), false);
  assert.equal(__testing.isUniqueViolation(new Error("no code field")), false);
  assert.equal(__testing.isUniqueViolation("not an object"), false);
  assert.equal(__testing.isUniqueViolation(null), false);
});
