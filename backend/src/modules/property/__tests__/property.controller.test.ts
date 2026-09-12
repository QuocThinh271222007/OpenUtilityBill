// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import {
  createCreatePropertyController,
  createDeletePropertyController,
  createListPropertiesController,
  createUpdatePropertyController,
} from "../property.controller";
import { Result, ok, fail } from "../../../shared/result";
import { RentalProperty } from "../property.model";
import { CreatePropertyInput, UpdatePropertyInput } from "../property-management.types";

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

function createFakeRequest(overrides: { body?: unknown; params?: Record<string, string> } = {}): Request {
  return { body: overrides.body, params: overrides.params ?? {} } as unknown as Request;
}

const SAMPLE: RentalProperty = { id: "1", name: "Khu trọ A", address: null, createdAt: new Date("2026-01-01T00:00:00.000Z") };

function fakeService(overrides: {
  list?: Result<RentalProperty[]>;
  create?: Result<RentalProperty>;
  update?: Result<RentalProperty>;
  delete?: Result<{ id: string }>;
}) {
  return {
    async list(): Promise<Result<RentalProperty[]>> {
      return overrides.list ?? ok([SAMPLE]);
    },
    async create(_input: CreatePropertyInput): Promise<Result<RentalProperty>> {
      return overrides.create ?? ok(SAMPLE);
    },
    async update(_id: string, _input: UpdatePropertyInput): Promise<Result<RentalProperty>> {
      return overrides.update ?? ok(SAMPLE);
    },
    async delete(_id: string): Promise<Result<{ id: string }>> {
      return overrides.delete ?? ok({ id: SAMPLE.id });
    },
  };
}

test("GET properties: 200, JSON-safe (createdAt ISO string)", async () => {
  const controller = createListPropertiesController(() => fakeService({}));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest(), res);
  assert.equal(state.statusCode, 200);
  assert.doesNotThrow(() => JSON.stringify(state.body));
  const body = state.body as { data: Array<{ createdAt: string }> };
  assert.equal(body.data[0].createdAt, "2026-01-01T00:00:00.000Z");
});

test("POST properties: hợp lệ -> 201", async () => {
  const controller = createCreatePropertyController(() => fakeService({}));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ body: { name: "Khu trọ A", address: null } }), res);
  assert.equal(state.statusCode, 201);
});

test("POST properties: name không phải string -> 400 VALIDATION_ERROR", async () => {
  const controller = createCreatePropertyController(() => fakeService({}));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ body: { name: 123, address: null } }), res);
  assert.equal(state.statusCode, 400);
  const body = state.body as { error: { code: string } };
  assert.equal(body.error.code, "VALIDATION_ERROR");
});

test("POST properties: body không phải object -> 400", async () => {
  const controller = createCreatePropertyController(() => fakeService({}));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ body: "nope" }), res);
  assert.equal(state.statusCode, 400);
});

test("POST properties: Service trả DATABASE_WRITE_FAILED -> 500", async () => {
  const controller = createCreatePropertyController(() =>
    fakeService({ create: fail("DATABASE_WRITE_FAILED", "lỗi ghi") })
  );
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ body: { name: "X", address: null } }), res);
  assert.equal(state.statusCode, 500);
});

test("PATCH properties/:propertyId: hợp lệ -> 200", async () => {
  const controller = createUpdatePropertyController(() => fakeService({}));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ body: { name: "Mới" }, params: { propertyId: "1" } }), res);
  assert.equal(state.statusCode, 200);
});

test("PATCH properties/:propertyId: Service trả PROPERTY_NOT_FOUND -> 404", async () => {
  const controller = createUpdatePropertyController(() =>
    fakeService({ update: fail("PROPERTY_NOT_FOUND", "không tìm thấy") })
  );
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ body: { name: "X" }, params: { propertyId: "999" } }), res);
  assert.equal(state.statusCode, 404);
});

test("PATCH properties/:propertyId: address không phải string/null -> 400", async () => {
  const controller = createUpdatePropertyController(() => fakeService({}));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ body: { address: 123 }, params: { propertyId: "1" } }), res);
  assert.equal(state.statusCode, 400);
});

test("DELETE properties/:propertyId: hợp lệ -> 200 với { id }", async () => {
  const controller = createDeletePropertyController(() => fakeService({}));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ params: { propertyId: "1" } }), res);
  assert.equal(state.statusCode, 200);
  const body = state.body as { success: boolean; data: { id: string } };
  assert.equal(body.success, true);
  assert.equal(body.data.id, "1");
});

test("DELETE properties/:propertyId: propertyId sai hình dạng -> 400 VALIDATION_ERROR", async () => {
  const controller = createDeletePropertyController(() =>
    fakeService({ delete: fail("VALIDATION_ERROR", "propertyId không hợp lệ") })
  );
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ params: { propertyId: "abc" } }), res);
  assert.equal(state.statusCode, 400);
});

test("DELETE properties/:propertyId: không tồn tại -> 404 PROPERTY_NOT_FOUND", async () => {
  const controller = createDeletePropertyController(() =>
    fakeService({ delete: fail("PROPERTY_NOT_FOUND", "không tìm thấy") })
  );
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ params: { propertyId: "999" } }), res);
  assert.equal(state.statusCode, 404);
});

test("DELETE properties/:propertyId: còn room tham chiếu -> 409 PROPERTY_HAS_DEPENDENCIES", async () => {
  const controller = createDeletePropertyController(() =>
    fakeService({ delete: fail("PROPERTY_HAS_DEPENDENCIES", "còn room tham chiếu") })
  );
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ params: { propertyId: "1" } }), res);
  assert.equal(state.statusCode, 409);
});

test("getService() throw -> 500 INTERNAL_ERROR", async () => {
  const controller = createListPropertiesController(() => {
    throw new Error("DATABASE_URL missing");
  });
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest(), res);
  assert.equal(state.statusCode, 500);
  const body = state.body as { error: { code: string } };
  assert.equal(body.error.code, "INTERNAL_ERROR");
});
