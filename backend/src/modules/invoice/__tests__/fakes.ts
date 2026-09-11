// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../../shared/result";
import { Room } from "../../room/room.model";
import { NewRoom, RoomRepository, UpdateRoom } from "../../../repositories/room.repository";
import { MeterReading, UtilityType } from "../../meter-reading/meter-reading.model";
import { NewMeterReading, MeterReadingRepository, UpdateMeterReading } from "../../../repositories/meter-reading.repository";
import {
  ElectricityTariffRepository,
  ElectricityTariffWithTiers,
  NewElectricityTariff,
  NewElectricityTariffTier,
  UpdateElectricityTariffParent,
} from "../../../repositories/electricity-tariff.repository";
import { NewWaterTariff, UpdateWaterTariff, WaterTariffRepository } from "../../../repositories/water-tariff.repository";
import { TariffEffectivePeriod } from "../../../repositories/tariff-shared.types";
import { ElectricityTariff, ElectricityTariffTier, WaterTariff } from "../../tariff/tariff.model";
import { Invoice, InvoiceItem } from "../invoice.model";
import { InvoiceRepository, NewInvoice, NewInvoiceItem } from "../../../repositories/invoice.repository";
import { InvoiceUnitOfWork } from "../../../repositories/invoice-unit-of-work";

/**
 * Trách nhiệm:
 * Fake (viết tay, KHÔNG dùng mocking library — xem docs/DEVELOPMENT.md
 * mục công cụ test) implementation của mọi Repository/UnitOfWork mà
 * `CreateInvoiceService` phụ thuộc — cho phép test orchestration của
 * Service mà KHÔNG cần PostgreSQL thật.
 *
 * Không chịu trách nhiệm:
 * - chứa logic nghiệp vụ nào — mỗi fake chỉ trả về đúng dữ liệu/lỗi
 *   được cấu hình sẵn bởi test, và (khi hữu ích) ghi lại lời gọi để test
 *   sau đó kiểm tra (ví dụ: "water reading có được yêu cầu không?").
 *
 * Mỗi Repository interface (`RoomRepository`, `MeterReadingRepository`,
 * `ElectricityTariffRepository`, `WaterTariffRepository`) có nhiều
 * phương thức hơn số mà `CreateInvoiceService` thực sự gọi tới. Để fake
 * này THỎA MÃN ĐẦY ĐỦ interface (bắt buộc bởi strict test-source
 * typecheck — không dùng `any`/`as unknown as`/`@ts-ignore`), mọi
 * phương thức KHÔNG được orchestration dùng tới trả về lỗi
 * `TEST_FAKE_UNSUPPORTED_OPERATION` xác định — xem `unsupported()` bên
 * dưới. Đây là mã lỗi CHỈ TỒN TẠI trong test code, không bao giờ xuất
 * hiện ở production error handling; nếu một test vô tình gọi tới một
 * phương thức chưa được cấu hình, lỗi này khiến việc đó thất bại RÕ
 * RÀNG thay vì âm thầm trả `undefined`.
 */
function unsupported<T>(operation: string): Promise<Result<T>> {
  return Promise.resolve(
    fail("TEST_FAKE_UNSUPPORTED_OPERATION", `Phương thức ${operation} không được phép được gọi trong fake này.`)
  );
}

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
    listAll(): Promise<Result<Room[]>> {
      return unsupported("RoomRepository.listAll");
    },
    create(_input: NewRoom): Promise<Result<Room>> {
      return unsupported("RoomRepository.create");
    },
    update(_id: string, _input: UpdateRoom): Promise<Result<Room>> {
      return unsupported("RoomRepository.update");
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
    findById(_id: string): Promise<Result<MeterReading>> {
      return unsupported("MeterReadingRepository.findById");
    },
    listByRoom(_roomId: string, _billingPeriod?: Date): Promise<Result<MeterReading[]>> {
      return unsupported("MeterReadingRepository.listByRoom");
    },
    create(_input: NewMeterReading): Promise<Result<MeterReading>> {
      return unsupported("MeterReadingRepository.create");
    },
    update(_id: string, _input: UpdateMeterReading): Promise<Result<MeterReading>> {
      return unsupported("MeterReadingRepository.update");
    },
    isReferencedByInvoice(_id: string): Promise<Result<boolean>> {
      return unsupported("MeterReadingRepository.isReferencedByInvoice");
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
    listAll(): Promise<Result<ElectricityTariffWithTiers[]>> {
      return unsupported("ElectricityTariffRepository.listAll");
    },
    listEffectivePeriods(): Promise<Result<TariffEffectivePeriod[]>> {
      return unsupported("ElectricityTariffRepository.listEffectivePeriods");
    },
    isReferencedByInvoice(_tariffId: string): Promise<Result<boolean>> {
      return unsupported("ElectricityTariffRepository.isReferencedByInvoice");
    },
    createTariff(_input: NewElectricityTariff): Promise<Result<ElectricityTariff>> {
      return unsupported("ElectricityTariffRepository.createTariff");
    },
    replaceTiers(_tariffId: string, _tiers: NewElectricityTariffTier[]): Promise<Result<ElectricityTariffTier[]>> {
      return unsupported("ElectricityTariffRepository.replaceTiers");
    },
    updateTariffParent(_id: string, _input: UpdateElectricityTariffParent): Promise<Result<ElectricityTariff>> {
      return unsupported("ElectricityTariffRepository.updateTariffParent");
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
    listAll(): Promise<Result<WaterTariff[]>> {
      return unsupported("WaterTariffRepository.listAll");
    },
    listEffectivePeriods(): Promise<Result<TariffEffectivePeriod[]>> {
      return unsupported("WaterTariffRepository.listEffectivePeriods");
    },
    isReferencedByInvoice(_tariffId: string): Promise<Result<boolean>> {
      return unsupported("WaterTariffRepository.isReferencedByInvoice");
    },
    create(_input: NewWaterTariff): Promise<Result<WaterTariff>> {
      return unsupported("WaterTariffRepository.create");
    },
    update(_id: string, _input: UpdateWaterTariff): Promise<Result<WaterTariff>> {
      return unsupported("WaterTariffRepository.update");
    },
  };
}

export interface FakeInvoiceRepositoryOptions {
  existingInvoice?: Invoice | null;
  /** Item đã "lưu sẵn" cho `existingInvoice` — dùng khi test đọc lại một invoice lịch sử mà không đi qua createInvoice/createInvoiceItems trước. */
  existingItems?: InvoiceItem[];
  createInvoiceResult?: Result<Invoice>;
  createInvoiceItemsResult?: Result<InvoiceItem[]>;
  findItemsByInvoiceIdResult?: Result<InvoiceItem[]>;
}

export interface FakeInvoiceRepository extends InvoiceRepository {
  readonly createInvoiceCalls: NewInvoice[];
  readonly createInvoiceItemsCalls: Array<{ invoiceId: string; items: NewInvoiceItem[] }>;
  readonly findItemsByInvoiceIdCalls: string[];
}

export function createFakeInvoiceRepository(options: FakeInvoiceRepositoryOptions = {}): FakeInvoiceRepository {
  const createInvoiceCalls: NewInvoice[] = [];
  const createInvoiceItemsCalls: Array<{ invoiceId: string; items: NewInvoiceItem[] }> = [];
  const findItemsByInvoiceIdCalls: string[] = [];
  let nextInvoiceId = 1;
  let nextItemId = 1;

  const itemsByInvoiceId = new Map<string, InvoiceItem[]>();
  if (options.existingInvoice && options.existingItems) {
    itemsByInvoiceId.set(options.existingInvoice.id, options.existingItems);
  }

  return {
    createInvoiceCalls,
    createInvoiceItemsCalls,
    findItemsByInvoiceIdCalls,

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
      const created = items.map((item) => ({
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
      }));
      itemsByInvoiceId.set(invoiceId, created);
      return ok(created);
    },

    async findItemsByInvoiceId(invoiceId: string): Promise<Result<InvoiceItem[]>> {
      findItemsByInvoiceIdCalls.push(invoiceId);
      if (options.findItemsByInvoiceIdResult) {
        return options.findItemsByInvoiceIdResult;
      }
      return ok(itemsByInvoiceId.get(invoiceId) ?? []);
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
