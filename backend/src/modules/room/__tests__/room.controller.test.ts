// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import {
  createCreateRoomController,
  createDeleteRoomController,
  createListRoomsController,
  createUpdateRoomController,
} from "../room.controller";
import { Result, ok, fail } from "../../../shared/result";
import { Room } from "../room.model";
import { CreateRoomInput, UpdateRoomInput } from "../room-management.types";

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

const SAMPLE: Room = { id: "1", propertyId: "10", name: "101", tenantCount: 4, createdAt: new Date("2026-01-01T00:00:00.000Z") };

function fakeService(overrides: { list?: Result<Room[]>; create?: Result<Room>; update?: Result<Room>; delete?: Result<{ id: string }> }) {
  return {
    async list(_propertyId?: string): Promise<Result<Room[]>> {
      return overrides.list ?? ok([SAMPLE]);
    },
    async create(_input: CreateRoomInput): Promise<Result<Room>> {
      return overrides.create ?? ok(SAMPLE);
    },
    async update(_id: string, _input: UpdateRoomInput): Promise<Result<Room>> {
      return overrides.update ?? ok(SAMPLE);
    },
    async delete(_id: string): Promise<Result<{ id: string }>> {
      return overrides.delete ?? ok({ id: SAMPLE.id });
    },
  };
}

test("GET rooms: 200", async () => {
  const controller = createListRoomsController(() => fakeService({}));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest(), res);
  assert.equal(state.statusCode, 200);
  assert.doesNotThrow(() => JSON.stringify(state.body));
});

test("GET rooms?propertyId=...: propertyId không phải string -> 400", async () => {
  const controller = createListRoomsController(() => fakeService({}));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ query: { propertyId: ["10"] } }), res);
  assert.equal(state.statusCode, 400);
});

test("POST rooms: hợp lệ -> 201", async () => {
  const controller = createCreateRoomController(() => fakeService({}));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ body: { propertyId: "10", name: "101", tenantCount: 4 } }), res);
  assert.equal(state.statusCode, 201);
});

test("POST rooms: tenantCount không phải number -> 400", async () => {
  const controller = createCreateRoomController(() => fakeService({}));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ body: { propertyId: "10", name: "101", tenantCount: "4" } }), res);
  assert.equal(state.statusCode, 400);
});

test("POST rooms: Service trả PROPERTY_NOT_FOUND -> 404", async () => {
  const controller = createCreateRoomController(() => fakeService({ create: fail("PROPERTY_NOT_FOUND", "không tìm thấy") }));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ body: { propertyId: "999", name: "101", tenantCount: 4 } }), res);
  assert.equal(state.statusCode, 404);
});

test("POST rooms: Service trả ROOM_ALREADY_EXISTS -> 409", async () => {
  const controller = createCreateRoomController(() => fakeService({ create: fail("ROOM_ALREADY_EXISTS", "đã tồn tại") }));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ body: { propertyId: "10", name: "101", tenantCount: 4 } }), res);
  assert.equal(state.statusCode, 409);
});

test("PATCH rooms/:roomId: hợp lệ -> 200", async () => {
  const controller = createUpdateRoomController(() => fakeService({}));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ body: { tenantCount: 5 }, params: { roomId: "1" } }), res);
  assert.equal(state.statusCode, 200);
});

test("PATCH rooms/:roomId: Service trả ROOM_NOT_FOUND -> 404", async () => {
  const controller = createUpdateRoomController(() => fakeService({ update: fail("ROOM_NOT_FOUND", "không tìm thấy") }));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ body: { tenantCount: 5 }, params: { roomId: "999" } }), res);
  assert.equal(state.statusCode, 404);
});

test("DELETE rooms/:roomId: hợp lệ -> 200 với { id }", async () => {
  const controller = createDeleteRoomController(() => fakeService({}));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ params: { roomId: "1" } }), res);
  assert.equal(state.statusCode, 200);
  const body = state.body as { data: { id: string } };
  assert.equal(body.data.id, "1");
});

test("DELETE rooms/:roomId: Service trả ROOM_NOT_FOUND -> 404", async () => {
  const controller = createDeleteRoomController(() => fakeService({ delete: fail("ROOM_NOT_FOUND", "không tìm thấy") }));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ params: { roomId: "999" } }), res);
  assert.equal(state.statusCode, 404);
});

test("DELETE rooms/:roomId: Service trả ROOM_HAS_DEPENDENCIES -> 409", async () => {
  const controller = createDeleteRoomController(() => fakeService({ delete: fail("ROOM_HAS_DEPENDENCIES", "còn phụ thuộc") }));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ params: { roomId: "1" } }), res);
  assert.equal(state.statusCode, 409);
});

test("getService() throw -> 500 INTERNAL_ERROR", async () => {
  const controller = createListRoomsController(() => {
    throw new Error("DATABASE_URL missing");
  });
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest(), res);
  assert.equal(state.statusCode, 500);
});
