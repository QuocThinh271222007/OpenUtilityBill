// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { ElectricityTariffManagementService } from "../electricity-tariff-management.service";
import { createFakeElectricityTariffRepository, createFakeElectricityTariffUnitOfWork } from "./fakes";
import { CreateElectricityTariffInput } from "../electricity-tariff-management.types";

function baseInput(overrides: Partial<CreateElectricityTariffInput> = {}): CreateElectricityTariffInput {
  return {
    name: "Biểu giá điện thử nghiệm",
    effectiveFrom: new Date("2026-10-01"),
    effectiveTo: null,
    electricityVatRate: "0.08",
    peoplePerQuotaUnit: 4,
    fallbackTierNumber: 2,
    // CỐ Ý CHỈ 3 bậc — chứng minh Service không giả định đúng 6 bậc.
    tiers: [
      { tierNumber: 1, thresholdKwh: "50", unitPrice: "1000" },
      { tierNumber: 2, thresholdKwh: "50", unitPrice: "1500" },
      { tierNumber: 3, thresholdKwh: null, unitPrice: "2000" },
    ],
    ...overrides,
  };
}

function buildService(options: Parameters<typeof createFakeElectricityTariffRepository>[0] = {}) {
  const electricityTariffRepository = createFakeElectricityTariffRepository(options);
  const { unitOfWork, state } = createFakeElectricityTariffUnitOfWork(electricityTariffRepository);
  return {
    service: new ElectricityTariffManagementService({ electricityTariffRepository, electricityTariffUnitOfWork: unitOfWork }),
    electricityTariffRepository,
    unitOfWorkState: state,
  };
}

test("list: trả về tất cả tariff kèm tiers (đã sắp xếp ở tầng Repository — xem postgres-electricity-tariff.repository.integration.test.ts)", async () => {
  const { service } = buildService({
    tariffs: [
      {
        tariff: { id: "1", name: "A", effectiveFrom: new Date("2026-01-01"), effectiveTo: null, electricityVatRate: "0.08", peoplePerQuotaUnit: 4, fallbackTierNumber: 2, createdAt: new Date("2026-01-01") },
        tiers: [],
      },
    ],
  });
  const result = await service.list();
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.length, 1);
});

test("create: cấu hình 3 bậc hợp lệ (KHÔNG giả định 6 bậc) -> thành công, ghi qua Unit of Work", async () => {
  const { service, electricityTariffRepository, unitOfWorkState } = buildService();
  const result = await service.create(baseInput());
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.tiers.length, 3);
  assert.equal(unitOfWorkState.runCallCount, 1);
  assert.equal(electricityTariffRepository.createTariffCalls.length, 1);
  assert.equal(electricityTariffRepository.replaceTiersCalls.length, 1);
  assert.equal(electricityTariffRepository.replaceTiersCalls[0].tiers.length, 3);
});

test("create: tierNumber trùng lặp -> DUPLICATE_TIER_NUMBER propagate từ Calculation Core, không ghi", async () => {
  const { service, electricityTariffRepository } = buildService();
  const result = await service.create(
    baseInput({
      tiers: [
        { tierNumber: 1, thresholdKwh: "50", unitPrice: "1000" },
        { tierNumber: 1, thresholdKwh: null, unitPrice: "2000" },
      ],
    })
  );
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "DUPLICATE_TIER_NUMBER");
  assert.equal(electricityTariffRepository.createTariffCalls.length, 0);
});

test("create: fallbackTierNumber không khớp tier nào -> TARIFF_CONFIGURATION_INVALID", async () => {
  const { service } = buildService();
  const result = await service.create(baseInput({ fallbackTierNumber: 99 }));
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "TARIFF_CONFIGURATION_INVALID");
});

test("create: electricityVatRate ngoài đoạn [0, 1] -> VALIDATION_ERROR", async () => {
  const { service } = buildService();
  const result = await service.create(baseInput({ electricityVatRate: "1.5" }));
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "VALIDATION_ERROR");
});

test("create: electricityVatRate quá 4 chữ số thập phân -> VALIDATION_ERROR", async () => {
  const { service } = buildService();
  const result = await service.create(baseInput({ electricityVatRate: "0.123456" }));
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "VALIDATION_ERROR");
});

test("create: peoplePerQuotaUnit không tạo quotaFactor hữu hạn (ví dụ 3) -> INVALID_PEOPLE_PER_QUOTA_UNIT propagate, KHÔNG làm yếu quy tắc dự án", async () => {
  const { service } = buildService();
  const result = await service.create(baseInput({ peoplePerQuotaUnit: 3 }));
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "INVALID_PEOPLE_PER_QUOTA_UNIT");
});

test("create: effectiveTo < effectiveFrom -> VALIDATION_ERROR", async () => {
  const { service } = buildService();
  const result = await service.create(baseInput({ effectiveFrom: new Date("2026-10-01"), effectiveTo: new Date("2026-09-01") }));
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "VALIDATION_ERROR");
});

test("create: khoảng hiệu lực chồng lấn tariff khác -> TARIFF_PERIOD_OVERLAP, không ghi", async () => {
  const { service, electricityTariffRepository } = buildService({
    tariffs: [
      {
        tariff: { id: "1", name: "Existing", effectiveFrom: new Date("2026-01-01"), effectiveTo: null, electricityVatRate: "0.08", peoplePerQuotaUnit: 4, fallbackTierNumber: 2, createdAt: new Date("2026-01-01") },
        tiers: [],
      },
    ],
  });
  const result = await service.create(baseInput({ effectiveFrom: new Date("2026-10-01"), effectiveTo: null }));
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "TARIFF_PERIOD_OVERLAP");
  assert.equal(electricityTariffRepository.createTariffCalls.length, 0);
});

test("create: TARIFF_ALREADY_EXISTS propagate từ Repository (UNIQUE(name, effective_from))", async () => {
  const { service } = buildService({ createTariffResult: { success: false, error: { code: "TARIFF_ALREADY_EXISTS", message: "đã tồn tại" } } });
  const result = await service.create(baseInput());
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "TARIFF_ALREADY_EXISTS");
});

test("create: createTariff thất bại -> KHÔNG gọi replaceTiers (rollback thật được chứng minh ở DB integration test)", async () => {
  const { service, electricityTariffRepository } = buildService({
    createTariffResult: { success: false, error: { code: "DATABASE_WRITE_FAILED", message: "lỗi giả lập" } },
  });
  const result = await service.create(baseInput());
  assert.equal(result.success, false);
  assert.equal(electricityTariffRepository.replaceTiersCalls.length, 0);
});

test("create: createTariff thành công nhưng replaceTiers thất bại -> Service trả thất bại (KHÔNG báo thành công giả)", async () => {
  const { service } = buildService({
    replaceTiersResult: { success: false, error: { code: "DATABASE_WRITE_FAILED", message: "lỗi giả lập" } },
  });
  const result = await service.create(baseInput());
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "DATABASE_WRITE_FAILED");
});

test("update: tariff KHÔNG bị tham chiếu -> thành công", async () => {
  const existing = {
    tariff: { id: "1", name: "Old", effectiveFrom: new Date("2026-01-01"), effectiveTo: null, electricityVatRate: "0.05", peoplePerQuotaUnit: 4, fallbackTierNumber: 2, createdAt: new Date("2026-01-01") },
    tiers: [],
  };
  const { service } = buildService({ tariffs: [existing], isReferencedByInvoiceResult: { success: true, data: false } });
  const result = await service.update("1", baseInput({ effectiveFrom: new Date("2026-01-01"), effectiveTo: null }));
  assert.equal(result.success, true);
});

test("update: tariff ĐÃ bị tham chiếu bởi invoice -> TARIFF_IN_USE, không ghi", async () => {
  const { service, unitOfWorkState } = buildService({ isReferencedByInvoiceResult: { success: true, data: true } });
  const result = await service.update("1", baseInput());
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "TARIFF_IN_USE");
  assert.equal(unitOfWorkState.runCallCount, 0);
});

test("update: tariffId không hợp lệ -> VALIDATION_ERROR trước khi kiểm tra tham chiếu", async () => {
  const { service, electricityTariffRepository } = buildService();
  const result = await service.update("not-an-id", baseInput());
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "VALIDATION_ERROR");
  assert.equal(electricityTariffRepository.createTariffCalls.length, 0);
});

test("database failure khi listEffectivePeriods (kiểm tra overlap) -> propagate", async () => {
  const electricityTariffRepository = createFakeElectricityTariffRepository();
  // Ghi đè listEffectivePeriods để giả lập lỗi database.
  electricityTariffRepository.listEffectivePeriods = async () => ({ success: false, error: { code: "DATABASE_READ_FAILED", message: "lỗi giả lập" } });
  const { unitOfWork } = createFakeElectricityTariffUnitOfWork(electricityTariffRepository);
  const service = new ElectricityTariffManagementService({ electricityTariffRepository, electricityTariffUnitOfWork: unitOfWork });
  const result = await service.create(baseInput());
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "DATABASE_READ_FAILED");
});
