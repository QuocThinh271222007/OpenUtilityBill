// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import {
  createCreateMeterReadingController,
  createDeleteMeterReadingController,
  createListMeterReadingsController,
  createUpdateMeterReadingController,
} from "../meter-reading.controller";
import { Result, ok, fail } from "../../../shared/result";
import { MeterReading } from "../meter-reading.model";
import { CreateMeterReadingInput, UpdateMeterReadingInput } from "../meter-reading-management.types";

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

function createFakeRequest(overrides: { body?: unknown; params?: Record<string, string>; query?: Record<string, unknown> } = {}): Request {
  return { body: overrides.body, params: overrides.params ?? {}, query: overrides.query ?? {} } as unknown as Request;
}

const SAMPLE: MeterReading = {
  id: "1",
  roomId: "1",
  billingPeriod: new Date("2026-09-01T00:00:00.000Z"),
  utilityType: "ELECTRICITY",
  previousReading: "0",
  currentReading: "120",
  meterMaximumValue: null,
  createdAt: new Date("2026-09-05T00:00:00.000Z"),
};

const VALID_BODY = {
  roomId: "1",
  billingPeriod: "2026-09-01",
  utilityType: "ELECTRICITY",
  previousReading: "0",
  currentReading: "120",
  meterMaximumValue: null,
};

function fakeService(overrides: {
  list?: Result<MeterReading[]>;
  create?: Result<MeterReading>;
  update?: Result<MeterReading>;
  delete?: Result<{ id: string }>;
}) {
  return {
    async list(_roomId: string, _billingPeriod?: Date): Promise<Result<MeterReading[]>> {
      return overrides.list ?? ok([SAMPLE]);
    },
    async create(_input: CreateMeterReadingInput): Promise<Result<MeterReading>> {
      return overrides.create ?? ok(SAMPLE);
    },
    async update(_id: string, _input: UpdateMeterReadingInput): Promise<Result<MeterReading>> {
      return overrides.update ?? ok(SAMPLE);
    },
    async delete(_id: string): Promise<Result<{ id: string }>> {
      return overrides.delete ?? ok({ id: SAMPLE.id });
    },
  };
}

test("GET meter-readings: hợp lệ -> 200, billingPeriod 'YYYY-MM-DD'", async () => {
  const controller = createListMeterReadingsController(() => fakeService({}));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ query: { roomId: "1" } }), res);
  assert.equal(state.statusCode, 200);
  const body = state.body as { data: Array<{ billingPeriod: string }> };
  assert.equal(body.data[0].billingPeriod, "2026-09-01");
});

test("GET meter-readings: thiếu roomId -> 400", async () => {
  const controller = createListMeterReadingsController(() => fakeService({}));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ query: {} }), res);
  assert.equal(state.statusCode, 400);
});

test("GET meter-readings: billingPeriod filter sai hình dạng -> 400", async () => {
  const controller = createListMeterReadingsController(() => fakeService({}));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ query: { roomId: "1", billingPeriod: "2026-9-1" } }), res);
  assert.equal(state.statusCode, 400);
});

test("POST meter-readings: hợp lệ -> 201", async () => {
  const controller = createCreateMeterReadingController(() => fakeService({}));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ body: VALID_BODY }), res);
  assert.equal(state.statusCode, 201);
});

test("POST meter-readings: billingPeriod sai hình dạng -> 400", async () => {
  const controller = createCreateMeterReadingController(() => fakeService({}));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ body: { ...VALID_BODY, billingPeriod: "not-a-date" } }), res);
  assert.equal(state.statusCode, 400);
});

test("POST meter-readings: Service trả METER_READING_ALREADY_EXISTS -> 409", async () => {
  const controller = createCreateMeterReadingController(() =>
    fakeService({ create: fail("METER_READING_ALREADY_EXISTS", "đã tồn tại") })
  );
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ body: VALID_BODY }), res);
  assert.equal(state.statusCode, 409);
});

test("POST meter-readings: Service trả INVALID_METER_READING -> 422", async () => {
  const controller = createCreateMeterReadingController(() => fakeService({ create: fail("INVALID_METER_READING", "vượt max") }));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ body: VALID_BODY }), res);
  assert.equal(state.statusCode, 422);
});

test("PUT meter-readings/:readingId: hợp lệ -> 200", async () => {
  const controller = createUpdateMeterReadingController(() => fakeService({}));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ body: VALID_BODY, params: { readingId: "1" } }), res);
  assert.equal(state.statusCode, 200);
});

test("PUT meter-readings/:readingId: Service trả METER_READING_IN_USE -> 409", async () => {
  const controller = createUpdateMeterReadingController(() =>
    fakeService({ update: fail("METER_READING_IN_USE", "đã tham chiếu") })
  );
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ body: VALID_BODY, params: { readingId: "1" } }), res);
  assert.equal(state.statusCode, 409);
});

test("DELETE meter-readings/:readingId: hợp lệ -> 200 với { id }", async () => {
  const controller = createDeleteMeterReadingController(() => fakeService({}));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ params: { readingId: "1" } }), res);
  assert.equal(state.statusCode, 200);
  const body = state.body as { data: { id: string } };
  assert.equal(body.data.id, "1");
});

test("DELETE meter-readings/:readingId: Service trả METER_READING_NOT_FOUND -> 404", async () => {
  const controller = createDeleteMeterReadingController(() =>
    fakeService({ delete: fail("METER_READING_NOT_FOUND", "không tìm thấy") })
  );
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ params: { readingId: "999" } }), res);
  assert.equal(state.statusCode, 404);
});

test("DELETE meter-readings/:readingId: Service trả METER_READING_IN_USE -> 409", async () => {
  const controller = createDeleteMeterReadingController(() =>
    fakeService({ delete: fail("METER_READING_IN_USE", "đã tham chiếu") })
  );
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ params: { readingId: "1" } }), res);
  assert.equal(state.statusCode, 409);
});

test("Service trả DATABASE_READ_FAILED -> 500", async () => {
  const controller = createListMeterReadingsController(() => fakeService({ list: fail("DATABASE_READ_FAILED", "lỗi") }));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ query: { roomId: "1" } }), res);
  assert.equal(state.statusCode, 500);
});

test("getService() throw -> 500 INTERNAL_ERROR", async () => {
  const controller = createListMeterReadingsController(() => {
    throw new Error("DATABASE_URL missing");
  });
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ query: { roomId: "1" } }), res);
  assert.equal(state.statusCode, 500);
  const body = state.body as { error: { code: string } };
  assert.equal(body.error.code, "INTERNAL_ERROR");
});
