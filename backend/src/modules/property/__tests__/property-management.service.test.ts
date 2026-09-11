// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { PropertyManagementService } from "../property-management.service";
import { createFakePropertyRepository } from "./fakes";
import { RentalProperty } from "../property.model";

const EXISTING: RentalProperty = { id: "1", name: "Khu trọ A", address: "123 X", createdAt: new Date("2026-01-01T00:00:00.000Z") };

test("PropertyManagementService.list: trả về danh sách từ Repository", async () => {
  const propertyRepository = createFakePropertyRepository({ properties: [EXISTING] });
  const service = new PropertyManagementService({ propertyRepository });
  const result = await service.list();
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.length, 1);
});

test("PropertyManagementService.create: name hợp lệ, address trim -> thành công", async () => {
  const propertyRepository = createFakePropertyRepository();
  const service = new PropertyManagementService({ propertyRepository });
  const result = await service.create({ name: "  Khu trọ B  ", address: "  456 Y  " });
  assert.equal(result.success, true);
  assert.equal(propertyRepository.createCalls[0].name, "Khu trọ B");
  assert.equal(propertyRepository.createCalls[0].address, "456 Y");
});

test("PropertyManagementService.create: name rỗng sau trim -> VALIDATION_ERROR, không gọi Repository", async () => {
  const propertyRepository = createFakePropertyRepository();
  const service = new PropertyManagementService({ propertyRepository });
  const result = await service.create({ name: "   ", address: null });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "VALIDATION_ERROR");
  assert.equal(propertyRepository.createCalls.length, 0);
});

test("PropertyManagementService.create: address rỗng sau trim -> chuẩn hoá thành null", async () => {
  const propertyRepository = createFakePropertyRepository();
  const service = new PropertyManagementService({ propertyRepository });
  await service.create({ name: "X", address: "   " });
  assert.equal(propertyRepository.createCalls[0].address, null);
});

test("PropertyManagementService.update: cập nhật thành công", async () => {
  const propertyRepository = createFakePropertyRepository({ properties: [{ ...EXISTING }] });
  const service = new PropertyManagementService({ propertyRepository });
  const result = await service.update("1", { name: "Tên mới" });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.name, "Tên mới");
});

test("PropertyManagementService.update: id không hợp lệ -> VALIDATION_ERROR, không gọi Repository", async () => {
  const propertyRepository = createFakePropertyRepository({ properties: [{ ...EXISTING }] });
  const service = new PropertyManagementService({ propertyRepository });
  const result = await service.update("not-an-id", { name: "X" });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "VALIDATION_ERROR");
  assert.equal(propertyRepository.updateCalls.length, 0);
});

test("PropertyManagementService.update: không có field nào -> VALIDATION_ERROR", async () => {
  const propertyRepository = createFakePropertyRepository({ properties: [{ ...EXISTING }] });
  const service = new PropertyManagementService({ propertyRepository });
  const result = await service.update("1", {});
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "VALIDATION_ERROR");
});

test("PropertyManagementService.update: id không tồn tại -> PROPERTY_NOT_FOUND", async () => {
  const propertyRepository = createFakePropertyRepository({ properties: [] });
  const service = new PropertyManagementService({ propertyRepository });
  const result = await service.update("999", { name: "X" });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "PROPERTY_NOT_FOUND");
});

test("PropertyManagementService.create: lỗi database propagate", async () => {
  const propertyRepository = createFakePropertyRepository({
    createResult: { success: false, error: { code: "DATABASE_WRITE_FAILED", message: "lỗi giả lập" } },
  });
  const service = new PropertyManagementService({ propertyRepository });
  const result = await service.create({ name: "X", address: null });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "DATABASE_WRITE_FAILED");
});
