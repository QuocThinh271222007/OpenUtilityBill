// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../../shared/result";
import { Room } from "../../room/room.model";
import { RoomRepository } from "../../../repositories/room.repository";
import { MeterReading, UtilityType } from "../../meter-reading/meter-reading.model";
import { MeterReadingRepository } from "../../../repositories/meter-reading.repository";
import { ElectricityTariffRepository, ElectricityTariffWithTiers } from "../../../repositories/electricity-tariff.repository";
import { WaterTariffRepository } from "../../../repositories/water-tariff.repository";
import { WaterTariff } from "../../tariff/tariff.model";
import { Invoice, InvoiceItem } from "../invoice.model";
import { InvoiceRepository, NewInvoice, NewInvoiceItem } from "../../../repositories/invoice.repository";
import { InvoiceUnitOfWork } from "../../../repositories/invoice-unit-of-work";

/**
 * Responsibility:
 * Fake (viết tay, KHÔNG dùng mocking library — xem docs/DEVELOPMENT.md
 * mục công cụ test) implementation của mọi Repository/UnitOfWork mà
 * `CreateInvoiceService` phụ thuộc — cho phép test orchestration của
 * Service mà KHÔNG cần PostgreSQL thật.
 *
 * Does NOT:
 * - chứa logic nghiệp vụ nào — mỗi fake chỉ trả về đúng dữ liệu/lỗi
 *   được cấu hình sẵn bởi test, và (khi hữu ích) ghi lại lời gọi để test
 *   sau đó kiểm tra (ví dụ: "water reading có được yêu cầu không?").
 */

export interface FakeRoomRepository extends RoomRepository {
  readonly calls: string[];
}

export function createFakeRoomRepository(room: Room | null): FakeRoomRepository {
  const calls: string[] = [];
  return {
    calls,
    async findById(id: string): Promise<Result<Room>> {
      calls.push(id);
      if (room === null || room.id !== id) {
        return fail("ROOM_NOT_FOUND", `Không tìm thấy room với id = ${id}.`);
      }
      return ok(room);
    },
  };
}

export interface FakeMeterReadingRepository extends MeterReadingRepository {
  readonly calls: Array<{ roomId: string; billingPeriod: Date; utilityType: UtilityType }>;
}

export function createFakeMeterReadingRepository(
  readings: Partial<Record<UtilityType, MeterReading>>
): FakeMeterReadingRepository {
  const calls: FakeMeterReadingRepository["calls"] = [];
  return {
    calls,
    async findByRoomPeriodAndUtility(roomId, billingPeriod, utilityType): Promise<Result<MeterReading>> {
      calls.push({ roomId, billingPeriod, utilityType });
      const reading = readings[utilityType];
      if (!reading) {
        return fail("METER_READING_NOT_FOUND", `Không tìm thấy meter reading cho room ${roomId}, loại ${utilityType}.`);
      }
      return ok(reading);
    },
  };
}

export function createFakeElectricityTariffRepository(data: ElectricityTariffWithTiers | null): ElectricityTariffRepository {
  return {
    async findApplicableTariffForPeriod(): Promise<Result<ElectricityTariffWithTiers>> {
      if (data === null) {
        return fail("TARIFF_NOT_FOUND", "Không tìm thấy electricity tariff đang có hiệu lực.");
      }
      return ok(data);
    },
  };
}

export function createFakeWaterTariffRepository(data: WaterTariff | null): WaterTariffRepository {
  return {
    async findApplicableTariffForPeriod(): Promise<Result<WaterTariff>> {
      if (data === null) {
        return fail("TARIFF_NOT_FOUND", "Không tìm thấy water tariff đang có hiệu lực.");
      }
      return ok(data);
    },
  };
}

export interface FakeInvoiceRepositoryOptions {
  existingInvoice?: Invoice | null;
  createInvoiceResult?: Result<Invoice>;
  createInvoiceItemsResult?: Result<InvoiceItem[]>;
}

export interface FakeInvoiceRepository extends InvoiceRepository {
  readonly createInvoiceCalls: NewInvoice[];
  readonly createInvoiceItemsCalls: Array<{ invoiceId: string; items: NewInvoiceItem[] }>;
}

export function createFakeInvoiceRepository(options: FakeInvoiceRepositoryOptions = {}): FakeInvoiceRepository {
  const createInvoiceCalls: NewInvoice[] = [];
  const createInvoiceItemsCalls: Array<{ invoiceId: string; items: NewInvoiceItem[] }> = [];
  let nextInvoiceId = 1;
  let nextItemId = 1;

  return {
    createInvoiceCalls,
    createInvoiceItemsCalls,

    async findByRoomAndPeriod(): Promise<Result<Invoice | null>> {
      return ok(options.existingInvoice ?? null);
    },

    async createInvoice(input: NewInvoice): Promise<Result<Invoice>> {
      createInvoiceCalls.push(input);
      if (options.createInvoiceResult) {
        return options.createInvoiceResult;
      }
      const id = String(nextInvoiceId++);
      return ok({
        id,
        roomId: input.roomId,
        billingPeriod: input.billingPeriod,
        tenantCountUsed: input.tenantCountUsed,
        electricityTariffId: input.electricityTariffId,
        waterTariffId: input.waterTariffId,
        electricityBillingMethod: input.electricityBillingMethod,
        waterBillingMethod: input.waterBillingMethod,
        electricityReadingId: input.electricityReadingId,
        waterReadingId: input.waterReadingId,
        calculatedTotal: input.calculatedTotal,
        actualChargedAmount: input.actualChargedAmount,
        createdAt: new Date("2026-09-10T00:00:00.000Z"),
      });
    },

    async createInvoiceItems(invoiceId: string, items: NewInvoiceItem[]): Promise<Result<InvoiceItem[]>> {
      createInvoiceItemsCalls.push({ invoiceId, items });
      if (options.createInvoiceItemsResult) {
        return options.createInvoiceItemsResult;
      }
      return ok(
        items.map((item) => ({
          id: String(nextItemId++),
          invoiceId,
          category: item.category,
          tierNumber: item.tierNumber,
          quantity: item.quantity,
          unitName: item.unitName,
          unitPrice: item.unitPrice,
          amount: item.amount,
          description: item.description,
          displayOrder: item.displayOrder,
        }))
      );
    },
  };
}

/**
 * Fake `InvoiceUnitOfWork` — chạy `work` trực tiếp bằng
 * `invoiceRepository` được truyền vào (KHÔNG có transaction thật, vì
 * đây là fake cho unit test). `state.runCallCount` cho test kiểm tra
 * "unit of work có được vào hay không" (ví dụ: case invoice đã tồn tại
 * -> KHÔNG được vào transaction).
 */
export function createFakeInvoiceUnitOfWork(invoiceRepository: InvoiceRepository): {
  unitOfWork: InvoiceUnitOfWork;
  state: { runCallCount: number };
} {
  const state = { runCallCount: 0 };
  const unitOfWork: InvoiceUnitOfWork = {
    async run<T>(work: (invoiceRepository: InvoiceRepository) => Promise<Result<T>>): Promise<Result<T>> {
      state.runCallCount += 1;
      return work(invoiceRepository);
    },
  };
  return { unitOfWork, state };
}
