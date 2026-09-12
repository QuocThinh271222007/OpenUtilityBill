// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { WaterTariffManagementService } from "../water-tariff-management.service";
import { createFakeWaterTariffRepository } from "./fakes";
import { CreateWaterTariffInput } from "../water-tariff-management.types";

function baseInput(overrides: Partial<CreateWaterTariffInput> = {}): CreateWaterTariffInput {
  return {
    name: "Biểu giá nước thử nghiệm",
    effectiveFrom: new Date("2026-10-01"),
    effectiveTo: null,
    pricePerCubicMeter: "8500",
    pricePerPerson: "80000",
    vatRate: "0.05",
    environmentalFeeRate: "0.10",
    ...overrides,
  };
}

test("list: trả về tất cả water tariff", async () => {
  const waterTariffRepository = createFakeWaterTariffRepository({
    tariffs: [{ id: "1", name: "A", effectiveFrom: new Date("2026-01-01"), effectiveTo: null, pricePerCubicMeter: "8500", pricePerPerson: "80000", vatRate: "0.05", environmentalFeeRate: "0.10", createdAt: new Date("2026-01-01") }],
  });
  const service = new WaterTariffManagementService({ waterTariffRepository });
  const result = await service.list();
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.length, 1);
});

test("create: hợp lệ -> thành công", async () => {
  const waterTariffRepository = createFakeWaterTariffRepository();
  const service = new WaterTariffManagementService({ waterTariffRepository });
  const result = await service.create(baseInput());
  assert.equal(result.success, true);
  assert.equal(waterTariffRepository.createCalls.length, 1);
});

test("create: pricePerCubicMeter sai hình dạng (quá 2 chữ số thập phân) -> VALIDATION_ERROR", async () => {
  const waterTariffRepository = createFakeWaterTariffRepository();
  const service = new WaterTariffManagementService({ waterTariffRepository });
  const result = await service.create(baseInput({ pricePerCubicMeter: "8500.999" }));
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "VALIDATION_ERROR");
});

test("create: vatRate ngoài đoạn [0, 1] -> VALIDATION_ERROR", async () => {
  const waterTariffRepository = createFakeWaterTariffRepository();
  const service = new WaterTariffManagementService({ waterTariffRepository });
  const result = await service.create(baseInput({ vatRate: "1.0001" }));
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "VALIDATION_ERROR");
});

test("create: environmentalFeeRate sai hình dạng -> VALIDATION_ERROR", async () => {
  const waterTariffRepository = createFakeWaterTariffRepository();
  const service = new WaterTariffManagementService({ waterTariffRepository });
  const result = await service.create(baseInput({ environmentalFeeRate: "abc" }));
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "VALIDATION_ERROR");
});

test("create: effectiveTo < effectiveFrom -> VALIDATION_ERROR", async () => {
  const waterTariffRepository = createFakeWaterTariffRepository();
  const service = new WaterTariffManagementService({ waterTariffRepository });
  const result = await service.create(baseInput({ effectiveFrom: new Date("2026-10-01"), effectiveTo: new Date("2026-09-01") }));
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "VALIDATION_ERROR");
});

test("create: chồng lấn khoảng hiệu lực -> TARIFF_PERIOD_OVERLAP, không ghi", async () => {
  const waterTariffRepository = createFakeWaterTariffRepository({
    tariffs: [{ id: "1", name: "Existing", effectiveFrom: new Date("2026-01-01"), effectiveTo: null, pricePerCubicMeter: "8500", pricePerPerson: "80000", vatRate: "0.05", environmentalFeeRate: "0.10", createdAt: new Date("2026-01-01") }],
  });
  const service = new WaterTariffManagementService({ waterTariffRepository });
  const result = await service.create(baseInput({ effectiveFrom: new Date("2026-06-01"), effectiveTo: null }));
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "TARIFF_PERIOD_OVERLAP");
  assert.equal(waterTariffRepository.createCalls.length, 0);
});

test("update: tariff KHÔNG bị tham chiếu -> thành công", async () => {
  const waterTariffRepository = createFakeWaterTariffRepository({
    tariffs: [{ id: "1", name: "Old", effectiveFrom: new Date("2026-01-01"), effectiveTo: null, pricePerCubicMeter: "8000", pricePerPerson: "75000", vatRate: "0.05", environmentalFeeRate: "0.10", createdAt: new Date("2026-01-01") }],
    isReferencedByInvoiceResult: { success: true, data: false },
  });
  const service = new WaterTariffManagementService({ waterTariffRepository });
  const result = await service.update("1", baseInput({ effectiveFrom: new Date("2026-01-01"), effectiveTo: null }));
  assert.equal(result.success, true);
});

test("update: tariff ĐÃ bị tham chiếu -> TARIFF_IN_USE, không ghi", async () => {
  const waterTariffRepository = createFakeWaterTariffRepository({ isReferencedByInvoiceResult: { success: true, data: true } });
  const service = new WaterTariffManagementService({ waterTariffRepository });
  const result = await service.update("1", baseInput());
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "TARIFF_IN_USE");
  assert.equal(waterTariffRepository.updateCalls.length, 0);
});

test("delete: tariff KHÔNG bị tham chiếu -> thành công", async () => {
  const waterTariffRepository = createFakeWaterTariffRepository({
    tariffs: [{ id: "1", name: "Old", effectiveFrom: new Date("2026-01-01"), effectiveTo: null, pricePerCubicMeter: "8000", pricePerPerson: "75000", vatRate: "0.05", environmentalFeeRate: "0.10", createdAt: new Date("2026-01-01") }],
    isReferencedByInvoiceResult: { success: true, data: false },
  });
  const service = new WaterTariffManagementService({ waterTariffRepository });
  const result = await service.delete("1");
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.id, "1");
  assert.deepEqual(waterTariffRepository.deleteCalls, ["1"]);
});

test("delete: tariff ĐÃ bị tham chiếu -> TARIFF_IN_USE, không xoá", async () => {
  const waterTariffRepository = createFakeWaterTariffRepository({ isReferencedByInvoiceResult: { success: true, data: true } });
  const service = new WaterTariffManagementService({ waterTariffRepository });
  const result = await service.delete("1");
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "TARIFF_IN_USE");
  assert.equal(waterTariffRepository.deleteCalls.length, 0);
});

test("delete: tariffId không hợp lệ -> VALIDATION_ERROR", async () => {
  const waterTariffRepository = createFakeWaterTariffRepository();
  const service = new WaterTariffManagementService({ waterTariffRepository });
  const result = await service.delete("not-an-id");
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "VALIDATION_ERROR");
});

test("delete: id không tồn tại -> TARIFF_NOT_FOUND", async () => {
  const waterTariffRepository = createFakeWaterTariffRepository({ isReferencedByInvoiceResult: { success: true, data: false } });
  const service = new WaterTariffManagementService({ waterTariffRepository });
  const result = await service.delete("999");
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "TARIFF_NOT_FOUND");
});

test("database failure khi ghi (create) -> propagate", async () => {
  const waterTariffRepository = createFakeWaterTariffRepository({
    createResult: { success: false, error: { code: "DATABASE_WRITE_FAILED", message: "lỗi giả lập" } },
  });
  const service = new WaterTariffManagementService({ waterTariffRepository });
  const result = await service.create(baseInput());
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "DATABASE_WRITE_FAILED");
});
