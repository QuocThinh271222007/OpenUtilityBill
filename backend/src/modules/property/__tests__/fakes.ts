// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../../shared/result";
import { RentalProperty } from "../property.model";
import { NewRentalProperty, PropertyRepository, UpdateRentalProperty } from "../../../repositories/property.repository";

export interface FakePropertyRepositoryOptions {
  properties?: RentalProperty[];
  createResult?: Result<RentalProperty>;
  updateResult?: Result<RentalProperty>;
}

export interface FakePropertyRepository extends PropertyRepository {
  readonly createCalls: NewRentalProperty[];
  readonly updateCalls: Array<{ id: string; input: UpdateRentalProperty }>;
}

/** Fake viết tay (không mocking library) — xem docs/DEVELOPMENT.md công cụ test. */
export function createFakePropertyRepository(options: FakePropertyRepositoryOptions = {}): FakePropertyRepository {
  const properties = options.properties ?? [];
  const createCalls: NewRentalProperty[] = [];
  const updateCalls: Array<{ id: string; input: UpdateRentalProperty }> = [];
  let nextId = 100;

  return {
    createCalls,
    updateCalls,

    async listAll(): Promise<Result<RentalProperty[]>> {
      return ok(properties);
    },

    async findById(id: string): Promise<Result<RentalProperty>> {
      const found = properties.find((p) => p.id === id);
      if (!found) return fail("PROPERTY_NOT_FOUND", `Không tìm thấy rental property với id = ${id}.`);
      return ok(found);
    },

    async create(input: NewRentalProperty): Promise<Result<RentalProperty>> {
      createCalls.push(input);
      if (options.createResult) return options.createResult;
      const created: RentalProperty = { id: String(nextId++), name: input.name, address: input.address, createdAt: new Date("2026-01-10T00:00:00.000Z") };
      properties.push(created);
      return ok(created);
    },

    async update(id: string, input: UpdateRentalProperty): Promise<Result<RentalProperty>> {
      updateCalls.push({ id, input });
      if (options.updateResult) return options.updateResult;
      const found = properties.find((p) => p.id === id);
      if (!found) return fail("PROPERTY_NOT_FOUND", `Không tìm thấy rental property với id = ${id}.`);
      if (input.name !== undefined) found.name = input.name;
      if (input.address !== undefined) found.address = input.address;
      return ok(found);
    },
  };
}
