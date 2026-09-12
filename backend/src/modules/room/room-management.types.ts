// SPDX-License-Identifier: MIT

import { RoomRepository } from "../../repositories/room.repository";
import { PropertyRepository } from "../../repositories/property.repository";

/** POST — cả ba field luôn bắt buộc. */
export interface CreateRoomInput {
  propertyId: string;
  name: string;
  tenantCount: number;
}

/** PATCH — `propertyId` KHÔNG có mặt (immutable), field vắng mặt nghĩa là "không đổi". */
export interface UpdateRoomInput {
  name?: string;
  tenantCount?: number;
}

/**
 * `propertyRepository` chỉ dùng để xác minh property tồn tại trước khi
 * tạo room (mục "Rooms" của docs/MANAGEMENT_API.md) — RoomManagementService
 * không có thao tác ghi nào lên `rental_properties`.
 */
export interface RoomManagementDependencies {
  roomRepository: RoomRepository;
  propertyRepository: PropertyRepository;
}
