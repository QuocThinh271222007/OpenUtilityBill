// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { MeterReadingManagementService } from "../meter-reading-management.service";
import { createFakeMeterReadingRepository } from "./fakes";
import { MeterReading } from "../meter-reading.model";
import { CreateMeterReadingInput } from "../meter-reading-management.types";

const BILLING_PERIOD = new Date("2026-09-01T00:00:00.000Z");

function baseInput(overrides: Partial<CreateMeterReadingInput> = {}): CreateMeterReadingInput {
  return {
    roomId: "1",
    billingPeriod: BILLING_PERIOD,
    utilityType: "ELECTRICITY",
    previousReading: "0",
    currentReading: "120",
    meterMaximumValue: null,
    ...overrides,
  };
}

test("MeterReadingManagementService.create: điện hợp lệ -> thành công", async () => {
  const meterReadingRepository = createFakeMeterReadingRepository();
  const service = new MeterReadingManagementService({ meterReadingRepository });
  const result = await service.create(baseInput());
  assert.equal(result.success, true);
  assert.equal(meterReadingRepository.createCalls.length, 1);
});

test("MeterReadingManagementService.create: nước hợp lệ -> thành công", async () => {
  const meterReadingRepository = createFakeMeterReadingRepository();
  const service = new MeterReadingManagementService({ meterReadingRepository });
  const result = await service.create(baseInput({ utilityType: "WATER", previousReading: "0", currentReading: "10" }));
  assert.equal(result.success, true);
});

test("MeterReadingManagementService.create: trùng room/period/utility -> METER_READING_ALREADY_EXISTS propagate", async () => {
  const meterReadingRepository = createFakeMeterReadingRepository({
    createResult: { success: false, error: { code: "METER_READING_ALREADY_EXISTS", message: "đã tồn tại" } },
  });
  const service = new MeterReadingManagementService({ meterReadingRepository });
  const result = await service.create(baseInput());
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "METER_READING_ALREADY_EXISTS");
});

test("MeterReadingManagementService.create: chuỗi thập phân sai hình dạng ('abc') -> VALIDATION_ERROR, không gọi Repository", async () => {
  const meterReadingRepository = createFakeMeterReadingRepository();
  const service = new MeterReadingManagementService({ meterReadingRepository });
  const result = await service.create(baseInput({ currentReading: "abc" }));
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "VALIDATION_ERROR");
  assert.equal(meterReadingRepository.createCalls.length, 0);
});

test("MeterReadingManagementService.create: quá 2 chữ số thập phân ('120.555') -> VALIDATION_ERROR", async () => {
  const meterReadingRepository = createFakeMeterReadingRepository();
  const service = new MeterReadingManagementService({ meterReadingRepository });
  const result = await service.create(baseInput({ currentReading: "120.555" }));
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "VALIDATION_ERROR");
});

test("MeterReadingManagementService.create: rollover có meterMaximumValue -> được chấp nhận", async () => {
  const meterReadingRepository = createFakeMeterReadingRepository();
  const service = new MeterReadingManagementService({ meterReadingRepository });
  const result = await service.create(baseInput({ previousReading: "99990", currentReading: "20", meterMaximumValue: "99999" }));
  assert.equal(result.success, true);
});

test("MeterReadingManagementService.create: current < previous KHÔNG có meterMaximumValue -> lỗi propagate từ Calculation Core (METER_MAXIMUM_REQUIRED)", async () => {
  const meterReadingRepository = createFakeMeterReadingRepository();
  const service = new MeterReadingManagementService({ meterReadingRepository });
  const result = await service.create(baseInput({ previousReading: "100", currentReading: "20", meterMaximumValue: null }));
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "METER_MAXIMUM_REQUIRED");
  assert.equal(meterReadingRepository.createCalls.length, 0);
});

test("MeterReadingManagementService.create: currentReading vượt meterMaximumValue -> lỗi propagate (INVALID_METER_READING)", async () => {
  const meterReadingRepository = createFakeMeterReadingRepository();
  const service = new MeterReadingManagementService({ meterReadingRepository });
  const result = await service.create(baseInput({ currentReading: "200", meterMaximumValue: "150" }));
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "INVALID_METER_READING");
});

test("MeterReadingManagementService.create: billingPeriod không phải ngày đầu tháng -> VALIDATION_ERROR", async () => {
  const meterReadingRepository = createFakeMeterReadingRepository();
  const service = new MeterReadingManagementService({ meterReadingRepository });
  const result = await service.create(baseInput({ billingPeriod: new Date("2026-09-02T00:00:00.000Z") }));
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "VALIDATION_ERROR");
});

test("MeterReadingManagementService.create: roomId không hợp lệ -> VALIDATION_ERROR", async () => {
  const meterReadingRepository = createFakeMeterReadingRepository();
  const service = new MeterReadingManagementService({ meterReadingRepository });
  const result = await service.create(baseInput({ roomId: "not-an-id" }));
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "VALIDATION_ERROR");
});

test("MeterReadingManagementService.list: trả về lịch sử theo room (thứ tự đến từ Repository — ORDER BY billing_period DESC do PostgresMeterReadingRepository đảm bảo, xem postgres-meter-reading.repository.integration.test.ts)", async () => {
  const readings: MeterReading[] = [
    { id: "1", roomId: "1", billingPeriod: BILLING_PERIOD, utilityType: "ELECTRICITY", previousReading: "0", currentReading: "120", meterMaximumValue: null, createdAt: BILLING_PERIOD },
  ];
  const meterReadingRepository = createFakeMeterReadingRepository({ readings });
  const service = new MeterReadingManagementService({ meterReadingRepository });
  const result = await service.list("1");
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.length, 1);
});

test("MeterReadingManagementService.update: reading không bị tham chiếu -> thành công", async () => {
  const existing: MeterReading = { id: "1", roomId: "1", billingPeriod: BILLING_PERIOD, utilityType: "ELECTRICITY", previousReading: "0", currentReading: "120", meterMaximumValue: null, createdAt: BILLING_PERIOD };
  const meterReadingRepository = createFakeMeterReadingRepository({ readings: [existing], isReferencedByInvoiceResult: { success: true, data: false } });
  const service = new MeterReadingManagementService({ meterReadingRepository });
  const result = await service.update("1", baseInput({ currentReading: "150" }));
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.currentReading, "150");
});

test("MeterReadingManagementService.update: reading ĐÃ được invoice tham chiếu -> METER_READING_IN_USE, không ghi", async () => {
  const existing: MeterReading = { id: "1", roomId: "1", billingPeriod: BILLING_PERIOD, utilityType: "ELECTRICITY", previousReading: "0", currentReading: "120", meterMaximumValue: null, createdAt: BILLING_PERIOD };
  const meterReadingRepository = createFakeMeterReadingRepository({ readings: [existing], isReferencedByInvoiceResult: { success: true, data: true } });
  const service = new MeterReadingManagementService({ meterReadingRepository });
  const result = await service.update("1", baseInput({ currentReading: "150" }));
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "METER_READING_IN_USE");
  assert.equal(meterReadingRepository.updateCalls.length, 0);
});

test("MeterReadingManagementService.update: database failure khi kiểm tra tham chiếu -> propagate", async () => {
  const meterReadingRepository = createFakeMeterReadingRepository({
    isReferencedByInvoiceResult: { success: false, error: { code: "DATABASE_READ_FAILED", message: "lỗi giả lập" } },
  });
  const service = new MeterReadingManagementService({ meterReadingRepository });
  const result = await service.update("1", baseInput());
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "DATABASE_READ_FAILED");
});

test("MeterReadingManagementService.update: readingId không hợp lệ -> VALIDATION_ERROR trước khi gọi Repository", async () => {
  const meterReadingRepository = createFakeMeterReadingRepository();
  const service = new MeterReadingManagementService({ meterReadingRepository });
  const result = await service.update("not-an-id", baseInput());
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.code, "VALIDATION_ERROR");
  assert.equal(meterReadingRepository.isReferencedByInvoiceCalls.length, 0);
});
