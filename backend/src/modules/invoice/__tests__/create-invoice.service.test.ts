// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { CreateInvoiceService } from "../create-invoice.service";
import { CreateInvoiceInput, CreateInvoiceDependencies } from "../create-invoice.types";
import { Room } from "../../room/room.model";
import { ElectricityTariff, ElectricityTariffTier, WaterTariff } from "../../tariff/tariff.model";
import { MeterReading, UtilityType } from "../../meter-reading/meter-reading.model";
import { Invoice, InvoiceItem } from "../invoice.model";
import { ElectricityTariffWithTiers } from "../../../repositories/electricity-tariff.repository";
import {
  createFakeElectricityTariffRepository,
  createFakeInvoiceRepository,
  createFakeInvoiceUnitOfWork,
  createFakeMeterReadingRepository,
  createFakeRoomRepository,
  createFakeWaterTariffRepository,
} from "./fakes";
import { Result } from "../../../shared/result";

/**
 * Trách nhiệm:
 * Test orchestration của `CreateInvoiceService` bằng fake Repository/
 * UnitOfWork (node:test + node:assert/strict, KHÔNG PostgreSQL thật,
 * KHÔNG mocking library) — xem `fakes.ts`.
 *
 * Dữ liệu tariff/tier dùng ở đây TRÙNG với
 * database/seeds/001_competition_defaults.sql (1984, 2050, 2380, 8500,
 * ...) CHỈ VÌ đây là fixture test — Calculation Core/Service sản xuất
 * KHÔNG chứa các hằng số này (xem "Hard-code audit" trong
 * docs/CREATE_INVOICE_WORKFLOW.md).
 */

const BILLING_PERIOD = new Date("2026-09-01T00:00:00.000Z");

const ROOM: Room = {
  id: "1",
  propertyId: "1",
  name: "101",
  tenantCount: 4,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

const ELECTRICITY_TARIFF: ElectricityTariff = {
  id: "10",
  name: "Test Electricity Tariff",
  effectiveFrom: new Date("2025-05-10T00:00:00.000Z"),
  effectiveTo: null,
  electricityVatRate: "0.08",
  peoplePerQuotaUnit: 4,
  fallbackTierNumber: 3,
  createdAt: new Date("2025-05-10T00:00:00.000Z"),
};

const ELECTRICITY_TIERS: ElectricityTariffTier[] = [
  { id: "101", tariffId: "10", tierNumber: 1, thresholdKwh: "50", unitPrice: "1984" },
  { id: "102", tariffId: "10", tierNumber: 2, thresholdKwh: "50", unitPrice: "2050" },
  { id: "103", tariffId: "10", tierNumber: 3, thresholdKwh: "100", unitPrice: "2380" },
  { id: "104", tariffId: "10", tierNumber: 4, thresholdKwh: "100", unitPrice: "2998" },
  { id: "105", tariffId: "10", tierNumber: 5, thresholdKwh: "100", unitPrice: "3350" },
  { id: "106", tariffId: "10", tierNumber: 6, thresholdKwh: null, unitPrice: "3460" },
];

const ELECTRICITY_TARIFF_WITH_TIERS: ElectricityTariffWithTiers = {
  tariff: ELECTRICITY_TARIFF,
  tiers: ELECTRICITY_TIERS,
};

const WATER_TARIFF: WaterTariff = {
  id: "20",
  name: "Test Water Tariff",
  effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
  effectiveTo: null,
  pricePerCubicMeter: "8500",
  pricePerPerson: "80000",
  vatRate: "0.05",
  environmentalFeeRate: "0.10",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

function electricityReading(previousReading: string, currentReading: string, meterMaximumValue: string | null = null): MeterReading {
  return {
    id: "200",
    roomId: "1",
    billingPeriod: BILLING_PERIOD,
    utilityType: "ELECTRICITY",
    previousReading,
    currentReading,
    meterMaximumValue,
    createdAt: BILLING_PERIOD,
  };
}

function waterMeterReading(previousReading: string, currentReading: string, meterMaximumValue: string | null = null): MeterReading {
  return {
    id: "300",
    roomId: "1",
    billingPeriod: BILLING_PERIOD,
    utilityType: "WATER",
    previousReading,
    currentReading,
    meterMaximumValue,
    createdAt: BILLING_PERIOD,
  };
}

function baseInput(overrides: Partial<CreateInvoiceInput> = {}): CreateInvoiceInput {
  return {
    roomId: "1",
    billingPeriod: BILLING_PERIOD,
    electricityBillingMethod: "QUOTA_TIERED",
    waterBillingMethod: "PER_CUBIC_METER",
    actualChargedAmount: null,
    ...overrides,
  };
}

interface BuildServiceOptions {
  room?: Room | null;
  existingInvoice?: Invoice | null;
  readings?: Partial<Record<UtilityType, MeterReading>>;
  electricityTariffData?: ElectricityTariffWithTiers | null;
  waterTariffData?: WaterTariff | null;
  createInvoiceResult?: Result<Invoice>;
  createInvoiceItemsResult?: Result<InvoiceItem[]>;
}

function buildService(options: BuildServiceOptions = {}) {
  const roomRepository = createFakeRoomRepository(options.room === undefined ? ROOM : options.room);
  const meterReadingRepository = createFakeMeterReadingRepository(options.readings ?? {});
  const electricityTariffRepository = createFakeElectricityTariffRepository(
    options.electricityTariffData === undefined ? ELECTRICITY_TARIFF_WITH_TIERS : options.electricityTariffData
  );
  const waterTariffRepository = createFakeWaterTariffRepository(
    options.waterTariffData === undefined ? WATER_TARIFF : options.waterTariffData
  );
  const invoiceRepository = createFakeInvoiceRepository({
    existingInvoice: options.existingInvoice ?? null,
    createInvoiceResult: options.createInvoiceResult,
    createInvoiceItemsResult: options.createInvoiceItemsResult,
  });
  const { unitOfWork, state: unitOfWorkState } = createFakeInvoiceUnitOfWork(invoiceRepository);

  const deps: CreateInvoiceDependencies = {
    roomRepository,
    invoiceRepository,
    meterReadingRepository,
    electricityTariffRepository,
    waterTariffRepository,
    invoiceUnitOfWork: unitOfWork,
  };

  return { service: new CreateInvoiceService(deps), roomRepository, meterReadingRepository, invoiceRepository, unitOfWorkState };
}

// ---- A. Happy path: QUOTA_TIERED + PER_CUBIC_METER ----

test("CreateInvoiceService: happy path QUOTA_TIERED + PER_CUBIC_METER", async () => {
  const { service, meterReadingRepository, invoiceRepository } = buildService({
    readings: {
      ELECTRICITY: electricityReading("0", "120"),
      WATER: waterMeterReading("0", "10"),
    },
  });

  const result = await service.execute(baseInput());

  assert.equal(result.success, true);
  if (!result.success) return;

  // gọi đúng repository (điện + nước, đúng thứ tự đó)
  assert.deepEqual(
    meterReadingRepository.calls.map((c) => c.utilityType),
    ["ELECTRICITY", "WATER"]
  );

  // meter usage calculated via Calculation Core (rollover-aware), not manual subtraction
  assert.equal(result.data.electricity.method, "QUOTA_TIERED");
  if (result.data.electricity.method === "QUOTA_TIERED") {
    assert.equal(result.data.electricity.result.usageKwh, "120");
  }

  // exact amounts preserved (sum-exact-then-round-once)
  assert.equal(result.data.electricity.result.exactTotal, "269244");
  assert.equal(result.data.water.exactTotal, "97750");
  assert.equal(result.data.invoiceTotal.roundedTotalVnd, "366994");

  // invoice inserted with correct tariff/reading references + tenant snapshot
  assert.equal(invoiceRepository.createInvoiceCalls.length, 1);
  const newInvoice = invoiceRepository.createInvoiceCalls[0];
  assert.equal(newInvoice.electricityTariffId, "10");
  assert.equal(newInvoice.waterTariffId, "20");
  assert.equal(newInvoice.electricityReadingId, "200");
  assert.equal(newInvoice.waterReadingId, "300");
  assert.equal(newInvoice.tenantCountUsed, 4);
  assert.equal(newInvoice.calculatedTotal, "366994");

  // invoice items inserted, deterministic order
  assert.equal(invoiceRepository.createInvoiceItemsCalls.length, 1);
  const items = invoiceRepository.createInvoiceItemsCalls[0].items;
  assert.deepEqual(
    items.map((i) => i.category),
    ["ELECTRICITY_TIER", "ELECTRICITY_TIER", "ELECTRICITY_TIER", "ELECTRICITY_VAT", "WATER_BASE", "WATER_VAT", "WATER_ENVIRONMENTAL_FEE"]
  );
  assert.deepEqual(
    items.map((i) => i.displayOrder),
    [1, 2, 3, 4, 5, 6, 7]
  );
  assert.deepEqual(
    items.slice(0, 3).map((i) => i.quantity),
    ["50", "50", "20"]
  );

  assert.equal(result.data.items.length, 7);
});

// ---- B. Happy path: FALLBACK_TIER_FLAT + PER_PERSON ----

test("CreateInvoiceService: happy path FALLBACK_TIER_FLAT + PER_PERSON", async () => {
  const { service, meterReadingRepository, invoiceRepository } = buildService({
    readings: {
      ELECTRICITY: electricityReading("100", "220"),
      // Cố ý KHÔNG cấu hình WATER — PER_PERSON không được phép cần nó.
    },
  });

  const result = await service.execute(
    baseInput({ electricityBillingMethod: "FALLBACK_TIER_FLAT", waterBillingMethod: "PER_PERSON" })
  );

  assert.equal(result.success, true);
  if (!result.success) return;

  // KHÔNG được tra water reading
  assert.deepEqual(
    meterReadingRepository.calls.map((c) => c.utilityType),
    ["ELECTRICITY"]
  );

  const newInvoice = invoiceRepository.createInvoiceCalls[0];
  assert.equal(newInvoice.waterReadingId, null);

  // fallback tier (tierNumber = 3, unitPrice = 2380) used, one flat charge line
  assert.equal(result.data.electricity.method, "FALLBACK_TIER_FLAT");
  if (result.data.electricity.method === "FALLBACK_TIER_FLAT") {
    assert.equal(result.data.electricity.result.fallbackTierNumber, 3);
    assert.equal(result.data.electricity.result.unitPrice, "2380");
    assert.equal(result.data.electricity.result.usageKwh, "120");
    assert.equal(result.data.electricity.result.exactTotal, "308448");
  }

  const items = invoiceRepository.createInvoiceItemsCalls[0].items;
  assert.deepEqual(
    items.map((i) => i.category),
    ["ELECTRICITY_TIER", "ELECTRICITY_VAT", "WATER_BASE", "WATER_VAT", "WATER_ENVIRONMENTAL_FEE"]
  );
  assert.equal(items.filter((i) => i.category === "ELECTRICITY_TIER").length, 1);
  assert.equal(items[0].tierNumber, 3);

  assert.equal(result.data.water.exactTotal, "368000");
  assert.equal(result.data.invoiceTotal.roundedTotalVnd, "676448");
});

// ---- C. Invoice already exists ----

test("CreateInvoiceService: invoice đã tồn tại -> INVOICE_ALREADY_EXISTS, không tính toán/ghi, không vào unit of work", async () => {
  const existingInvoice: Invoice = {
    id: "99",
    roomId: "1",
    billingPeriod: BILLING_PERIOD,
    tenantCountUsed: 4,
    electricityTariffId: "10",
    waterTariffId: "20",
    electricityBillingMethod: "QUOTA_TIERED",
    waterBillingMethod: "PER_CUBIC_METER",
    electricityReadingId: "200",
    waterReadingId: "300",
    calculatedTotal: "366994",
    actualChargedAmount: null,
    createdAt: BILLING_PERIOD,
  };
  const { service, invoiceRepository, unitOfWorkState } = buildService({ existingInvoice });

  const result = await service.execute(baseInput());

  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.error.code, "INVOICE_ALREADY_EXISTS");
  assert.equal(invoiceRepository.createInvoiceCalls.length, 0);
  assert.equal(unitOfWorkState.runCallCount, 0);
});

// ---- D. Missing electricity reading ----

test("CreateInvoiceService: thiếu electricity reading -> METER_READING_NOT_FOUND, không ghi", async () => {
  const { service, invoiceRepository } = buildService({ readings: {} });

  const result = await service.execute(baseInput());

  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.error.code, "METER_READING_NOT_FOUND");
  assert.equal(invoiceRepository.createInvoiceCalls.length, 0);
});

// ---- E. Missing water reading when PER_CUBIC_METER ----

test("CreateInvoiceService: PER_CUBIC_METER thiếu water reading -> lỗi propagate, không ghi", async () => {
  const { service, invoiceRepository } = buildService({
    readings: { ELECTRICITY: electricityReading("0", "120") },
  });

  const result = await service.execute(baseInput({ waterBillingMethod: "PER_CUBIC_METER" }));

  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.error.code, "METER_READING_NOT_FOUND");
  assert.equal(invoiceRepository.createInvoiceCalls.length, 0);
});

// ---- F. PER_PERSON with no water reading configured — success still possible ----

test("CreateInvoiceService: PER_PERSON không cần water reading -> vẫn thành công", async () => {
  const { service } = buildService({
    readings: { ELECTRICITY: electricityReading("0", "50") },
  });

  const result = await service.execute(
    baseInput({ electricityBillingMethod: "QUOTA_TIERED", waterBillingMethod: "PER_PERSON" })
  );

  assert.equal(result.success, true);
});

// ---- G. Invalid method ----

test("CreateInvoiceService: electricityBillingMethod không hợp lệ -> VALIDATION_ERROR, không đọc DB, không ghi", async () => {
  const { service, roomRepository, invoiceRepository } = buildService({
    readings: { ELECTRICITY: electricityReading("0", "120"), WATER: waterMeterReading("0", "10") },
  });

  const result = await service.execute(baseInput({ electricityBillingMethod: "NOT_A_REAL_METHOD" }));

  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.error.code, "VALIDATION_ERROR");
  assert.equal(roomRepository.calls.length, 0, "validation phải fail TRƯỚC khi đọc Room");
  assert.equal(invoiceRepository.createInvoiceCalls.length, 0);
});

// ---- H. tenantCount = 0 with QUOTA_TIERED ----

test("CreateInvoiceService: tenantCount = 0 với QUOTA_TIERED -> lỗi propagate từ Calculation Core (INVALID_TENANT_COUNT), không tự chế quy tắc 0 người", async () => {
  const { service, invoiceRepository } = buildService({
    room: { ...ROOM, tenantCount: 0 },
    readings: { ELECTRICITY: electricityReading("0", "120"), WATER: waterMeterReading("0", "10") },
  });

  const result = await service.execute(baseInput());

  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.error.code, "INVALID_TENANT_COUNT");
  assert.equal(invoiceRepository.createInvoiceCalls.length, 0);
});

// ---- I. Rollover reading ----

test("CreateInvoiceService: chỉ số công tơ quay vòng (rollover) -> usage tính bằng Calculation Core, không phải current - previous thủ công", async () => {
  const { service } = buildService({
    readings: {
      // current(20) < previous(99990) nhưng có meterMaximumValue=99999
      // -> rollover usage = (99999 + 1 - 99990) + 20 = 30, KHÔNG PHẢI
      // 20 - 99990 (âm, vô nghĩa).
      ELECTRICITY: electricityReading("99990", "20", "99999"),
    },
  });

  const result = await service.execute(
    baseInput({ electricityBillingMethod: "QUOTA_TIERED", waterBillingMethod: "PER_PERSON" })
  );

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.electricity.method, "QUOTA_TIERED");
  if (result.data.electricity.method === "QUOTA_TIERED") {
    assert.equal(result.data.electricity.result.usageKwh, "30");
  }
});

// ---- J. actualChargedAmount provided ----

test("CreateInvoiceService: actualChargedAmount khác null -> billingDifference = actual - legalRoundedTotal, KHÔNG lưu difference riêng", async () => {
  const { service, invoiceRepository } = buildService({
    readings: {
      ELECTRICITY: electricityReading("0", "120"),
      WATER: waterMeterReading("0", "10"),
    },
  });

  const result = await service.execute(baseInput({ actualChargedAmount: "367000" }));

  assert.equal(result.success, true);
  if (!result.success) return;
  // legalRoundedTotal = 366994 (xem test happy-path A) -> difference = 6
  assert.equal(result.data.invoiceTotal.roundedTotalVnd, "366994");
  assert.equal(result.data.billingDifference, "6");

  const newInvoice = invoiceRepository.createInvoiceCalls[0];
  assert.equal(newInvoice.actualChargedAmount, "367000");
  // NewInvoice không có field difference/chênh lệch nào — kiểm tra cấu
  // trúc để không ai âm thầm thêm lại field đã bị loại bỏ có chủ đích.
  assert.equal("differenceAmount" in newInvoice, false);
});

// ---- K. actualChargedAmount null ----

test("CreateInvoiceService: actualChargedAmount null -> billingDifference = null", async () => {
  const { service } = buildService({
    readings: {
      ELECTRICITY: electricityReading("0", "120"),
      WATER: waterMeterReading("0", "10"),
    },
  });

  const result = await service.execute(baseInput({ actualChargedAmount: null }));

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.billingDifference, null);
});

// ---- L. Write failure after invoice creation (fake UnitOfWork semantics) ----

test("CreateInvoiceService: createInvoiceItems thất bại sau khi createInvoice thành công -> Service trả về thất bại, KHÔNG báo thành công giả", async () => {
  const { service, invoiceRepository } = buildService({
    readings: {
      ELECTRICITY: electricityReading("0", "120"),
      WATER: waterMeterReading("0", "10"),
    },
    createInvoiceItemsResult: { success: false, error: { code: "DATABASE_WRITE_FAILED", message: "lỗi ghi giả lập" } },
  });

  const result = await service.execute(baseInput());

  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.error.code, "DATABASE_WRITE_FAILED");
  // createInvoice ĐÃ được gọi (và "thành công" ở fake này) — bằng chứng
  // ROLLBACK THẬT (transaction thật không để lại invoice mồ côi) được
  // chứng minh RIÊNG bởi integration test chạy trên PostgreSQL thật
  // (backend/src/repositories/__tests__/postgres-invoice-unit-of-work.integration.test.ts),
  // KHÔNG phải bởi fake này — fake chỉ chứng minh Service KHÔNG tự ý
  // trả thành công khi write phase thất bại.
  assert.equal(invoiceRepository.createInvoiceCalls.length, 1);
});

// ---- Sửa lỗi scale actualChargedAmount (hợp đồng lưu trữ NUMERIC(14,2)) ----

test("CreateInvoiceService: actualChargedAmount với hơn 2 chữ số thập phân -> VALIDATION_ERROR TRƯỚC roomRepository.findById, không đọc/ghi gì", async () => {
  const { service, roomRepository, invoiceRepository } = buildService({
    readings: { ELECTRICITY: electricityReading("0", "120"), WATER: waterMeterReading("0", "10") },
  });

  const result = await service.execute(baseInput({ actualChargedAmount: "367000.123456" }));

  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.error.code, "VALIDATION_ERROR");
  assert.equal(roomRepository.calls.length, 0, "phải fail TRƯỚC khi đọc Room");
  assert.equal(invoiceRepository.createInvoiceCalls.length, 0);
});

test("CreateInvoiceService: actualChargedAmount 13 chữ số phần nguyên (vượt NUMERIC(14,2)) -> VALIDATION_ERROR", async () => {
  const { service } = buildService();
  const result = await service.execute(baseInput({ actualChargedAmount: "1000000000000" }));
  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.error.code, "VALIDATION_ERROR");
});

test("CreateInvoiceService: actualChargedAmount âm -> VALIDATION_ERROR", async () => {
  const { service } = buildService();
  const result = await service.execute(baseInput({ actualChargedAmount: "-1" }));
  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.error.code, "VALIDATION_ERROR");
});

test("CreateInvoiceService: actualChargedAmount không phải số -> VALIDATION_ERROR", async () => {
  const { service } = buildService();
  const result = await service.execute(baseInput({ actualChargedAmount: "abc" }));
  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.error.code, "VALIDATION_ERROR");
});

test("CreateInvoiceService: actualChargedAmount đúng scale 2 ('367000.12') -> được chấp nhận, lưu ĐÚNG NGUYÊN VĂN", async () => {
  const { service, invoiceRepository } = buildService({
    readings: { ELECTRICITY: electricityReading("0", "120"), WATER: waterMeterReading("0", "10") },
  });

  const result = await service.execute(baseInput({ actualChargedAmount: "367000.12" }));

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(invoiceRepository.createInvoiceCalls[0].actualChargedAmount, "367000.12");
  // legalRoundedTotal = 366994 (xem happy-path A) -> difference = 367000.12 - 366994 = 6.12
  assert.equal(result.data.billingDifference, "6.12");
});

test("CreateInvoiceService: actualChargedAmount là số nguyên không phần thập phân ('480000') -> được chấp nhận", async () => {
  const { service } = buildService({
    readings: { ELECTRICITY: electricityReading("0", "120"), WATER: waterMeterReading("0", "10") },
  });
  const result = await service.execute(baseInput({ actualChargedAmount: "480000" }));
  assert.equal(result.success, true);
});

test("CreateInvoiceService: actualChargedAmount tối đa scale (12 chữ số nguyên + 2 thập phân) -> được chấp nhận", async () => {
  const { service } = buildService({
    readings: { ELECTRICITY: electricityReading("0", "120"), WATER: waterMeterReading("0", "10") },
  });
  const result = await service.execute(baseInput({ actualChargedAmount: "999999999999.99" }));
  assert.equal(result.success, true);
});
