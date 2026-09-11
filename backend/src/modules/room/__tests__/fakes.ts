// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../../shared/result";
import { Room } from "../room.model";
import { RentalProperty } from "../../property/property.model";
import { NewRoom, RoomRepository, UpdateRoom } from "../../../repositories/room.repository";
import { PropertyRepository } from "../../../repositories/property.repository";

export interface FakeRoomRepositoryOptions {
  rooms?: Room[];
  createResult?: Result<Room>;
  updateResult?: Result<Room>;
}

export interface FakeRoomRepository extends RoomRepository {
  readonly createCalls: NewRoom[];
  readonly updateCalls: Array<{ id: string; input: UpdateRoom }>;
}

export function createFakeRoomRepository(options: FakeRoomRepositoryOptions = {}): FakeRoomRepository {
  const rooms = options.rooms ?? [];
  const createCalls: NewRoom[] = [];
  const updateCalls: Array<{ id: string; input: UpdateRoom }> = [];
  let nextId = 100;

  return {
    createCalls,
    updateCalls,

    async findById(id: string): Promise<Result<Room>> {
      const found = rooms.find((r) => r.id === id);
      if (!found) return fail("ROOM_NOT_FOUND", `Không tìm thấy room với id = ${id}.`);
      return ok(found);
    },

    async listAll(propertyId?: string): Promise<Result<Room[]>> {
      return ok(propertyId === undefined ? rooms : rooms.filter((r) => r.propertyId === propertyId));
    },

    async create(input: NewRoom): Promise<Result<Room>> {
      createCalls.push(input);
      if (options.createResult) return options.createResult;
      const created: Room = { id: String(nextId++), propertyId: input.propertyId, name: input.name, tenantCount: input.tenantCount, createdAt: new Date("2026-01-10T00:00:00.000Z") };
      rooms.push(created);
      return ok(created);
    },

    async update(id: string, input: UpdateRoom): Promise<Result<Room>> {
      updateCalls.push({ id, input });
      if (options.updateResult) return options.updateResult;
      const found = rooms.find((r) => r.id === id);
      if (!found) return fail("ROOM_NOT_FOUND", `Không tìm thấy room với id = ${id}.`);
      if (input.name !== undefined) found.name = input.name;
      if (input.tenantCount !== undefined) found.tenantCount = input.tenantCount;
      return ok(found);
    },
  };
}

export function createFakePropertyRepository(properties: RentalProperty[]): PropertyRepository {
  return {
    async listAll(): Promise<Result<RentalProperty[]>> {
      return ok(properties);
    },
    async findById(id: string): Promise<Result<RentalProperty>> {
      const found = properties.find((p) => p.id === id);
      if (!found) return fail("PROPERTY_NOT_FOUND", `Không tìm thấy rental property với id = ${id}.`);
      return ok(found);
    },
    async create(): Promise<Result<RentalProperty>> {
      throw new Error("createFakePropertyRepository: create() không dùng trong test RoomManagementService.");
    },
    async update(): Promise<Result<RentalProperty>> {
      throw new Error("createFakePropertyRepository: update() không dùng trong test RoomManagementService.");
    },
  };
}
