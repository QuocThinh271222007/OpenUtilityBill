// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { RoomManagementService } from "../room-management.service";
import { createFakePropertyRepository, createFakeRoomRepository } from "./fakes";
import { Room } from "../room.model";
import { RentalProperty } from "../../property/property.model";

const PROPERTY_A: RentalProperty = { id: "10", name: "Khu trọ A", address: null, createdAt: new Date("2026-01-01T00:00:00.000Z") };
const PROPERTY_B: RentalProperty = { id: "20", name: "Khu trọ B", address: null, createdAt: new Date("2026-01-01T00:00:00.000Z") };
const ROOM_101_IN_A: Room = { id: "1", propertyId: "10", name: "101", tenantCount: 4, createdAt: new Date("2026-01-02T00:00:00.000Z") };

function buildService(rooms: Room[] = [], properties: RentalProperty[] = [PROPERTY_A, PROPERTY_B]) {
  const roomRepository = createFakeRoomRepository({ rooms });
  const propertyRepository = createFakePropertyRepository(properties);
  return { service: new RoomManagementService({ roomRepository, propertyRepository }), roomRepository };
}

test("RoomManagementService.list: không filter -> trả về tất cả", async () => {
  const { service } = buildService([ROOM_101_IN_A]);
  const result = await service.list();
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.length, 1);
});

test("RoomManagementService.list: filter theo propertyId", async () => {
  const otherRoom: Room = { id: "2", propertyId: "20", name: "201", tenantCount: 2, createdAt: new Date("2026-01-02T00:00:00.000Z") };
  const { service } = buildService([ROOM_101_IN_A, otherRoom]);
  const result = await service.list("10");
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0].propertyId, "10");
  }
});

test("RoomManagementService.create: hợp lệ -> thành công", async () => {
  const { service, roomRepository } = buildService();
  const result = await service.create({ propertyId: "10", name: "101", tenantCount: 4 });
  assert.equal(result.success, true);
  assert.equal(roomRepository.createCalls.length, 1);
});

test("RoomManagementService.create: property không tồn tại -> PROPERTY_NOT_FOUND, không gọi roomRepository.create", async () => {
  const { service, roomRepository } = buildService([], []);
  const result = await service.create({ propertyId: "999", name: "101", tenantCount: 4 });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "PROPERTY_NOT_FOUND");
  assert.equal(roomRepository.createCalls.length, 0);
});

test("RoomManagementService.create: tenantCount < 0 -> VALIDATION_ERROR", async () => {
  const { service } = buildService();
  const result = await service.create({ propertyId: "10", name: "101", tenantCount: -1 });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "VALIDATION_ERROR");
});

test("RoomManagementService.create: tenantCount không phải số nguyên -> VALIDATION_ERROR", async () => {
  const { service } = buildService();
  const result = await service.create({ propertyId: "10", name: "101", tenantCount: 4.5 });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "VALIDATION_ERROR");
});

test("RoomManagementService.create: room trùng tên trong CÙNG property -> ROOM_ALREADY_EXISTS propagate từ Repository", async () => {
  const roomRepository = createFakeRoomRepository({
    createResult: { success: false, error: { code: "ROOM_ALREADY_EXISTS", message: "đã tồn tại" } },
  });
  const propertyRepository = createFakePropertyRepository([PROPERTY_A]);
  const service = new RoomManagementService({ roomRepository, propertyRepository });
  const result = await service.create({ propertyId: "10", name: "101", tenantCount: 4 });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "ROOM_ALREADY_EXISTS");
});

test("RoomManagementService.create: cùng tên room nhưng KHÁC property -> Repository vẫn được gọi bình thường (model/repository cho phép)", async () => {
  const { service, roomRepository } = buildService([ROOM_101_IN_A]);
  const result = await service.create({ propertyId: "20", name: "101", tenantCount: 2 });
  assert.equal(result.success, true);
  assert.equal(roomRepository.createCalls.length, 1);
});

test("RoomManagementService.update: cập nhật tenantCount thành công", async () => {
  const { service } = buildService([{ ...ROOM_101_IN_A }]);
  const result = await service.update("1", { tenantCount: 6 });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.tenantCount, 6);
});

test("RoomManagementService.update: cập nhật tenantCount KHÔNG sửa invoice lịch sử (bất biến thiết kế — Service không đọc/ghi bảng invoices)", async () => {
  const { service, roomRepository } = buildService([{ ...ROOM_101_IN_A }]);
  await service.update("1", { tenantCount: 99 });
  // Xác nhận UpdateRoom gửi tới Repository CHỈ chứa tenantCount — không
  // có trường nào liên quan invoice/tenantCountUsed tồn tại trong type
  // UpdateRoom, nên không có đường nào để Service này chạm tới invoice.
  assert.deepEqual(roomRepository.updateCalls[0].input, { tenantCount: 99 });
});

test("RoomManagementService.update: không có field nào -> VALIDATION_ERROR", async () => {
  const { service } = buildService([{ ...ROOM_101_IN_A }]);
  const result = await service.update("1", {});
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "VALIDATION_ERROR");
});

test("RoomManagementService.update: id không tồn tại -> ROOM_NOT_FOUND", async () => {
  const { service } = buildService([]);
  const result = await service.update("999", { tenantCount: 1 });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "ROOM_NOT_FOUND");
});
