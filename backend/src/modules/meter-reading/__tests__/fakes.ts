// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../../shared/result";
import { MeterReading, UtilityType } from "../meter-reading.model";
import { MeterReadingRepository, NewMeterReading, UpdateMeterReading } from "../../../repositories/meter-reading.repository";

export interface FakeMeterReadingRepositoryOptions {
  readings?: MeterReading[];
  createResult?: Result<MeterReading>;
  updateResult?: Result<MeterReading>;
  isReferencedByInvoiceResult?: Result<boolean>;
  deleteResult?: Result<{ id: string }>;
}

export interface FakeMeterReadingRepository extends MeterReadingRepository {
  readonly createCalls: NewMeterReading[];
  readonly updateCalls: Array<{ id: string; input: UpdateMeterReading }>;
  readonly isReferencedByInvoiceCalls: string[];
  readonly deleteCalls: string[];
}

export function createFakeMeterReadingRepository(options: FakeMeterReadingRepositoryOptions = {}): FakeMeterReadingRepository {
  const readings = options.readings ?? [];
  const createCalls: NewMeterReading[] = [];
  const updateCalls: Array<{ id: string; input: UpdateMeterReading }> = [];
  const isReferencedByInvoiceCalls: string[] = [];
  const deleteCalls: string[] = [];
  let nextId = 100;

  return {
    createCalls,
    updateCalls,
    isReferencedByInvoiceCalls,
    deleteCalls,

    async findById(id: string): Promise<Result<MeterReading>> {
      const found = readings.find((r) => r.id === id);
      if (!found) return fail("METER_READING_NOT_FOUND", `Không tìm thấy meter reading với id = ${id}.`);
      return ok(found);
    },

    async findByRoomPeriodAndUtility(roomId: string, billingPeriod: Date, utilityType: UtilityType): Promise<Result<MeterReading>> {
      const found = readings.find(
        (r) => r.roomId === roomId && r.billingPeriod.getTime() === billingPeriod.getTime() && r.utilityType === utilityType
      );
      if (!found) return fail("METER_READING_NOT_FOUND", "Không tìm thấy meter reading.");
      return ok(found);
    },

    async listByRoom(roomId: string, billingPeriod?: Date): Promise<Result<MeterReading[]>> {
      let filtered = readings.filter((r) => r.roomId === roomId);
      if (billingPeriod !== undefined) {
        filtered = filtered.filter((r) => r.billingPeriod.getTime() === billingPeriod.getTime());
      }
      return ok(filtered);
    },

    async create(input: NewMeterReading): Promise<Result<MeterReading>> {
      createCalls.push(input);
      if (options.createResult) return options.createResult;
      const created: MeterReading = { id: String(nextId++), roomId: input.roomId, billingPeriod: input.billingPeriod, utilityType: input.utilityType, previousReading: input.previousReading, currentReading: input.currentReading, meterMaximumValue: input.meterMaximumValue, createdAt: new Date("2026-01-10T00:00:00.000Z") };
      readings.push(created);
      return ok(created);
    },

    async update(id: string, input: UpdateMeterReading): Promise<Result<MeterReading>> {
      updateCalls.push({ id, input });
      if (options.updateResult) return options.updateResult;
      const found = readings.find((r) => r.id === id);
      if (!found) return fail("METER_READING_NOT_FOUND", `Không tìm thấy meter reading với id = ${id}.`);
      found.roomId = input.roomId;
      found.billingPeriod = input.billingPeriod;
      found.utilityType = input.utilityType;
      found.previousReading = input.previousReading;
      found.currentReading = input.currentReading;
      found.meterMaximumValue = input.meterMaximumValue;
      return ok(found);
    },

    async isReferencedByInvoice(id: string): Promise<Result<boolean>> {
      isReferencedByInvoiceCalls.push(id);
      return options.isReferencedByInvoiceResult ?? ok(false);
    },

    async deleteById(id: string): Promise<Result<{ id: string }>> {
      deleteCalls.push(id);
      if (options.deleteResult) return options.deleteResult;
      const index = readings.findIndex((r) => r.id === id);
      if (index === -1) return fail("METER_READING_NOT_FOUND", `Không tìm thấy meter reading với id = ${id}.`);
      readings.splice(index, 1);
      return ok({ id });
    },
  };
}
