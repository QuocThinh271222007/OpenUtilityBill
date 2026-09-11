// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { createGetInvoiceController, createPostInvoiceController } from "../invoice.controller";
import { Result, ok, fail } from "../../../shared/result";
import { CreateInvoiceInput, CreateInvoiceResult } from "../create-invoice.types";
import { GetInvoiceInput, GetInvoiceResult } from "../get-invoice.types";
import { Invoice, InvoiceItem } from "../invoice.model";

/**
 * Responsibility:
 * Test Controller (`invoice.controller.ts`) bằng fake `Request`/
 * `Response` (object thuần tuý, không Express server thật) + fake
 * Service (node:test + node:assert/strict, KHÔNG supertest/Jest/
 * Vitest/Mocha) — chứng minh HTTP contract (status code, response
 * shape) mà KHÔNG cần PostgreSQL. Round-trip qua Express thật (real
 * network) được chứng minh riêng bởi
 * `invoice.api.integration.test.ts`, gated bởi `DATABASE_URL`.
 *
 * Does NOT:
 * - cần một Service THẬT — mỗi test tự cấu hình fake Service trả về
 *   đúng `Result` mong muốn (`ok(...)`/`fail(...)`), độc lập với
 *   CreateInvoiceService/GetInvoiceService thật.
 */

function createFakeResponse(): { res: Response; state: { statusCode: number | null; body: unknown } } {
  const state: { statusCode: number | null; body: unknown } = { statusCode: null, body: undefined };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(body: unknown) {
      state.body = body;
      return res;
    },
  };
  return { res: res as unknown as Response, state };
}

function createFakeRequest(overrides: { body?: unknown; query?: Record<string, unknown> } = {}): Request {
  return { body: overrides.body, query: overrides.query ?? {} } as unknown as Request;
}

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
  calculatedTotal: "366994",
  actualChargedAmount: null,
  createdAt: new Date("2026-09-10T00:00:00.000Z"),
};

const SAMPLE_ITEMS: InvoiceItem[] = [
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
];

const SAMPLE_CREATE_RESULT: CreateInvoiceResult = {
  invoice: SAMPLE_INVOICE,
  items: SAMPLE_ITEMS,
  electricity: {
    method: "QUOTA_TIERED",
    result: {
      usageKwh: "120",
      quotaFactor: "1",
      appliedTiers: [],
      subtotal: "99200",
      vatRate: "0.08",
      vatAmount: "19944",
      exactTotal: "269244",
      roundedTotalVnd: "269244",
    },
  },
  water: {
    method: "PER_CUBIC_METER",
    base: "85000",
    vatRate: "0.05",
    vatAmount: "4250",
    environmentalFeeRate: "0.10",
    environmentalFeeAmount: "8500",
    exactTotal: "97750",
    roundedTotalVnd: "97750",
  },
  invoiceTotal: { exactTotal: "366994", roundedTotalVnd: "366994" },
  billingDifference: null,
};

function fakeCreateService(result: Result<CreateInvoiceResult>): { execute(input: CreateInvoiceInput): Promise<Result<CreateInvoiceResult>> } {
  return { async execute() { return result; } };
}

function fakeGetService(result: Result<GetInvoiceResult>): { execute(input: GetInvoiceInput): Promise<Result<GetInvoiceResult>> } {
  return { async execute() { return result; } };
}

const VALID_POST_BODY = {
  roomId: "1",
  billingPeriod: "2026-09-01",
  electricityBillingMethod: "QUOTA_TIERED",
  waterBillingMethod: "PER_CUBIC_METER",
  actualChargedAmount: null,
};

// ---- POST /api/v1/invoices ----

test("POST invoices: hợp lệ -> 201, data JSON-safe (billingPeriod 'YYYY-MM-DD', không BigInt)", async () => {
  const controller = createPostInvoiceController(() => fakeCreateService(ok(SAMPLE_CREATE_RESULT)));
  const { res, state } = createFakeResponse();

  await controller(createFakeRequest({ body: VALID_POST_BODY }), res);

  assert.equal(state.statusCode, 201);
  assert.doesNotThrow(() => JSON.stringify(state.body));
  const body = state.body as { success: boolean; data: { invoice: { billingPeriod: string } } };
  assert.equal(body.success, true);
  assert.equal(body.data.invoice.billingPeriod, "2026-09-01");
});

test("POST invoices: billingPeriod sai hình dạng -> 400 VALIDATION_ERROR, Service KHÔNG được gọi", async () => {
  let serviceCalled = false;
  const controller = createPostInvoiceController(() => {
    serviceCalled = true;
    return fakeCreateService(ok(SAMPLE_CREATE_RESULT));
  });
  const { res, state } = createFakeResponse();

  await controller(createFakeRequest({ body: { ...VALID_POST_BODY, billingPeriod: "2026-9-1" } }), res);

  assert.equal(state.statusCode, 400);
  const body = state.body as { success: boolean; error: { code: string } };
  assert.equal(body.success, false);
  assert.equal(body.error.code, "VALIDATION_ERROR");
  assert.equal(serviceCalled, false, "getService() không được gọi khi validate đã fail (xem invoice.controller.ts)");
});

test("POST invoices: billingPeriod không phải ngày đầu tháng -> 400", async () => {
  const controller = createPostInvoiceController(() => fakeCreateService(ok(SAMPLE_CREATE_RESULT)));
  const { res, state } = createFakeResponse();

  await controller(createFakeRequest({ body: { ...VALID_POST_BODY, billingPeriod: "2026-09-02" } }), res);

  assert.equal(state.statusCode, 400);
});

test("POST invoices: electricityBillingMethod không phải string -> 400 VALIDATION_ERROR", async () => {
  const controller = createPostInvoiceController(() => fakeCreateService(ok(SAMPLE_CREATE_RESULT)));
  const { res, state } = createFakeResponse();

  await controller(createFakeRequest({ body: { ...VALID_POST_BODY, electricityBillingMethod: 123 } }), res);

  assert.equal(state.statusCode, 400);
  const body = state.body as { error: { code: string } };
  assert.equal(body.error.code, "VALIDATION_ERROR");
});

test("POST invoices: Service trả ROOM_NOT_FOUND -> 404", async () => {
  const controller = createPostInvoiceController(() => fakeCreateService(fail("ROOM_NOT_FOUND", "không tìm thấy room")));
  const { res, state } = createFakeResponse();

  await controller(createFakeRequest({ body: VALID_POST_BODY }), res);

  assert.equal(state.statusCode, 404);
});

test("POST invoices: Service trả INVOICE_ALREADY_EXISTS -> 409", async () => {
  const controller = createPostInvoiceController(() => fakeCreateService(fail("INVOICE_ALREADY_EXISTS", "đã tồn tại")));
  const { res, state } = createFakeResponse();

  await controller(createFakeRequest({ body: VALID_POST_BODY }), res);

  assert.equal(state.statusCode, 409);
});

test("POST invoices: Service trả lỗi cấu hình/tính toán (AMBIGUOUS_TARIFF_CONFIGURATION) -> 422", async () => {
  const controller = createPostInvoiceController(() => fakeCreateService(fail("AMBIGUOUS_TARIFF_CONFIGURATION", "nhiều hơn một tariff khớp")));
  const { res, state } = createFakeResponse();

  await controller(createFakeRequest({ body: VALID_POST_BODY }), res);

  assert.equal(state.statusCode, 422);
});

test("POST invoices: Service trả DATABASE_WRITE_FAILED -> 500, KHÔNG lộ chi tiết PostgreSQL", async () => {
  const controller = createPostInvoiceController(() => fakeCreateService(fail("DATABASE_WRITE_FAILED", "Không thể ghi dữ liệu invoice vào database.")));
  const { res, state } = createFakeResponse();

  await controller(createFakeRequest({ body: VALID_POST_BODY }), res);

  assert.equal(state.statusCode, 500);
  const body = state.body as { error: { message: string } };
  assert.equal(/sql|constraint|DATABASE_URL/i.test(body.error.message), false);
});

test("POST invoices: getService() throw (ví dụ DATABASE_URL thiếu) -> 500 INTERNAL_ERROR, không crash process", async () => {
  const controller = createPostInvoiceController(() => {
    throw new Error("Không thể khởi tạo Postgres.js client: DATABASE_URL thiếu.");
  });
  const { res, state } = createFakeResponse();

  await controller(createFakeRequest({ body: VALID_POST_BODY }), res);

  assert.equal(state.statusCode, 500);
  const body = state.body as { error: { code: string; message: string } };
  assert.equal(body.error.code, "INTERNAL_ERROR");
  assert.equal(body.error.message.includes("DATABASE_URL"), false, "không lộ chi tiết lỗi nội bộ ra response");
});

test("POST invoices: body không phải object -> 400 VALIDATION_ERROR", async () => {
  const controller = createPostInvoiceController(() => fakeCreateService(ok(SAMPLE_CREATE_RESULT)));
  const { res, state } = createFakeResponse();

  await controller(createFakeRequest({ body: "not-an-object" }), res);

  assert.equal(state.statusCode, 400);
});

// ---- GET /api/v1/invoices ----

const SAMPLE_GET_RESULT: GetInvoiceResult = {
  invoice: SAMPLE_INVOICE,
  items: SAMPLE_ITEMS,
  billingDifference: "6",
};

test("GET invoices: hợp lệ, invoice tồn tại -> 200, items theo displayOrder, billingDifference suy ra (không tính lại)", async () => {
  const controller = createGetInvoiceController(() => fakeGetService(ok(SAMPLE_GET_RESULT)));
  const { res, state } = createFakeResponse();

  await controller(createFakeRequest({ query: { roomId: "1", billingPeriod: "2026-09-01" } }), res);

  assert.equal(state.statusCode, 200);
  const body = state.body as { success: boolean; data: { billingDifference: string | null; items: unknown[] } };
  assert.equal(body.success, true);
  assert.equal(body.data.billingDifference, "6");
  assert.equal(body.data.items.length, 1);
});

test("GET invoices: invoice không tồn tại -> 404 INVOICE_NOT_FOUND", async () => {
  const controller = createGetInvoiceController(() => fakeGetService(fail("INVOICE_NOT_FOUND", "không tìm thấy invoice")));
  const { res, state } = createFakeResponse();

  await controller(createFakeRequest({ query: { roomId: "1", billingPeriod: "2026-09-01" } }), res);

  assert.equal(state.statusCode, 404);
  const body = state.body as { error: { code: string } };
  assert.equal(body.error.code, "INVOICE_NOT_FOUND");
});

test("GET invoices: thiếu roomId trong query -> 400", async () => {
  const controller = createGetInvoiceController(() => fakeGetService(ok(SAMPLE_GET_RESULT)));
  const { res, state } = createFakeResponse();

  await controller(createFakeRequest({ query: { billingPeriod: "2026-09-01" } }), res);

  assert.equal(state.statusCode, 400);
});

test("GET invoices: billingPeriod sai hình dạng trong query -> 400", async () => {
  const controller = createGetInvoiceController(() => fakeGetService(ok(SAMPLE_GET_RESULT)));
  const { res, state } = createFakeResponse();

  await controller(createFakeRequest({ query: { roomId: "1", billingPeriod: "not-a-date" } }), res);

  assert.equal(state.statusCode, 400);
});

test("GET invoices: Service trả DATABASE_READ_FAILED -> 500", async () => {
  const controller = createGetInvoiceController(() => fakeGetService(fail("DATABASE_READ_FAILED", "lỗi đọc database")));
  const { res, state } = createFakeResponse();

  await controller(createFakeRequest({ query: { roomId: "1", billingPeriod: "2026-09-01" } }), res);

  assert.equal(state.statusCode, 500);
});
