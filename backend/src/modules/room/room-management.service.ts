// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../shared/result";
import { isPositiveIntegerId } from "../../shared/validation/id";
import { Room } from "./room.model";
import { NewRoom, UpdateRoom } from "../../repositories/room.repository";
import { CreateRoomInput, RoomManagementDependencies, UpdateRoomInput } from "./room-management.types";

/**
 * Trách nhiệm:
 * Business validation + orchestration cho quản lý `Room` — `list`/
 * `create`/`update`.
 *
 * Điều kiện lỗi:
 * - `VALIDATION_ERROR`: `propertyId`/`id` sai hình dạng BIGINT, `name`
 *   rỗng sau trim, `tenantCount` không phải số nguyên `>= 0`, hoặc PATCH
 *   không có field nào.
 * - `create`: `PROPERTY_NOT_FOUND` propagate khi `propertyId` không tồn
 *   tại (kiểm tra TRƯỚC khi gọi `roomRepository.create`).
 * - `create`/`update`: `ROOM_ALREADY_EXISTS` propagate từ Repository
 *   khi vi phạm `UNIQUE(property_id, name)` — kể cả khi hai request
 *   đồng thời cùng vượt qua một pre-check giả định (không có ở đây,
 *   Service không tự làm pre-check riêng vì `UNIQUE` là ràng buộc DB
 *   đã đủ mạnh cho race condition này, không cần một pre-check bổ sung
 *   như invoice's `findByRoomAndPeriod`).
 *
 * Bất biến quan trọng:
 * `Room.tenantCount` là trạng thái HIỆN TẠI — sửa nó qua `update`
 * KHÔNG BAO GIỜ sửa `Invoice.tenantCountUsed` của các hoá đơn đã tạo
 * trước đó (snapshot bất biến, xem
 * `../invoice/invoice.model.ts` mục "Why Invoice snapshots
 * configuration"). Service này không đọc/ghi bảng `invoices` — bất biến
 * này đúng ĐƠN GIẢN vì không có code nào ở đây làm điều ngược lại.
 *
 * Không chịu trách nhiệm:
 * - cho phép đổi `propertyId` qua `update` — xem `UpdateRoomInput`.
 * - chứa SQL/Postgres.js import.
 */
function normalizeName(name: string): Result<string> {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return fail("VALIDATION_ERROR", "name không được rỗng.");
  }
  return ok(trimmed);
}

function isValidTenantCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

export class RoomManagementService {
  constructor(private readonly deps: RoomManagementDependencies) {}

  async list(propertyId?: string): Promise<Result<Room[]>> {
    if (propertyId !== undefined && !isPositiveIntegerId(propertyId)) {
      return fail("VALIDATION_ERROR", `propertyId không hợp lệ (phải là chuỗi số nguyên dương): "${propertyId}".`);
    }
    return this.deps.roomRepository.listAll(propertyId);
  }

  async create(input: CreateRoomInput): Promise<Result<Room>> {
    if (!isPositiveIntegerId(input.propertyId)) {
      return fail("VALIDATION_ERROR", `propertyId không hợp lệ (phải là chuỗi số nguyên dương): "${input.propertyId}".`);
    }
    const nameResult = normalizeName(input.name);
    if (!nameResult.success) {
      return nameResult;
    }
    if (!isValidTenantCount(input.tenantCount)) {
      return fail("VALIDATION_ERROR", `tenantCount không hợp lệ (phải là số nguyên >= 0): ${input.tenantCount}.`);
    }

    // Xác minh property tồn tại TRƯỚC khi ghi room — không dựa vào FK
    // violation để báo lỗi (thông điệp rõ ràng hơn PROPERTY_NOT_FOUND
    // so với một lỗi ghi chung chung).
    const propertyResult = await this.deps.propertyRepository.findById(input.propertyId);
    if (!propertyResult.success) {
      return propertyResult;
    }

    const newRoom: NewRoom = { propertyId: input.propertyId, name: nameResult.data, tenantCount: input.tenantCount };
    return this.deps.roomRepository.create(newRoom);
  }

  async update(id: string, input: UpdateRoomInput): Promise<Result<Room>> {
    if (!isPositiveIntegerId(id)) {
      return fail("VALIDATION_ERROR", `roomId không hợp lệ (phải là chuỗi số nguyên dương): "${id}".`);
    }
    if (input.name === undefined && input.tenantCount === undefined) {
      return fail("VALIDATION_ERROR", "PATCH phải cung cấp ít nhất một field (name hoặc tenantCount).");
    }

    const update: UpdateRoom = {};
    if (input.name !== undefined) {
      const nameResult = normalizeName(input.name);
      if (!nameResult.success) {
        return nameResult;
      }
      update.name = nameResult.data;
    }
    if (input.tenantCount !== undefined) {
      if (!isValidTenantCount(input.tenantCount)) {
        return fail("VALIDATION_ERROR", `tenantCount không hợp lệ (phải là số nguyên >= 0): ${input.tenantCount}.`);
      }
      update.tenantCount = input.tenantCount;
    }

    return this.deps.roomRepository.update(id, update);
  }
}
