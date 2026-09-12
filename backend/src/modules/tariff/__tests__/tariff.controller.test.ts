// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import {
  createCreateElectricityTariffController,
  createCreateWaterTariffController,
  createDeleteElectricityTariffController,
  createDeleteWaterTariffController,
  createListElectricityTariffsController,
  createListWaterTariffsController,
  createUpdateElectricityTariffController,
  createUpdateWaterTariffController,
} from "../tariff.controller";
import { Result, ok, fail } from "../../../shared/result";
import { WaterTariff } from "../tariff.model";
import { ElectricityTariffWithTiers } from "../../../repositories/electricity-tariff.repository";
import { CreateElectricityTariffInput, UpdateElectricityTariffInput } from "../electricity-tariff-management.types";
import { CreateWaterTariffInput, UpdateWaterTariffInput } from "../water-tariff-management.types";

function createFakeResponse(): { res: Response; state: { statusCode: number | null; body: unknown } } {
  const state: { statusCode: number | null; body: unknown } = { statusCode: null, body: undefined };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(body: unknown) {
      state.body = body;
      return res;
    },
  };
  return { res: res as unknown as Response, state };
}

function createFakeRequest(overrides: { body?: unknown; params?: Record<string, string> } = {}): Request {
  return { body: overrides.body, params: overrides.params ?? {} } as unknown as Request;
}

const SAMPLE_ELECTRICITY: ElectricityTariffWithTiers = {
  tariff: {
    id: "1",
    name: "A",
    effectiveFrom: new Date("2026-10-01T00:00:00.000Z"),
    effectiveTo: null,
    electricityVatRate: "0.08",
    peoplePerQuotaUnit: 4,
    fallbackTierNumber: 2,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  tiers: [{ id: "1", tariffId: "1", tierNumber: 1, thresholdKwh: "50", unitPrice: "1000" }],
};

const VALID_ELECTRICITY_BODY = {
  name: "Biểu giá điện",
  effectiveFrom: "2026-10-01",
  effectiveTo: null,
  electricityVatRate: "0.08",
  peoplePerQuotaUnit: 4,
  fallbackTierNumber: 1,
  tiers: [{ tierNumber: 1, thresholdKwh: null, unitPrice: "1000" }],
};

function fakeElectricityService(overrides: {
  list?: Result<ElectricityTariffWithTiers[]>;
  create?: Result<ElectricityTariffWithTiers>;
  update?: Result<ElectricityTariffWithTiers>;
  delete?: Result<{ id: string }>;
}) {
  return {
    async list(): Promise<Result<ElectricityTariffWithTiers[]>> {
      return overrides.list ?? ok([SAMPLE_ELECTRICITY]);
    },
    async create(_input: CreateElectricityTariffInput): Promise<Result<ElectricityTariffWithTiers>> {
      return overrides.create ?? ok(SAMPLE_ELECTRICITY);
    },
    async update(_id: string, _input: UpdateElectricityTariffInput): Promise<Result<ElectricityTariffWithTiers>> {
      return overrides.update ?? ok(SAMPLE_ELECTRICITY);
    },
    async delete(_id: string): Promise<Result<{ id: string }>> {
      return overrides.delete ?? ok({ id: SAMPLE_ELECTRICITY.tariff.id });
    },
  };
}

const SAMPLE_WATER: WaterTariff = {
  id: "1",
  name: "A",
  effectiveFrom: new Date("2026-10-01T00:00:00.000Z"),
  effectiveTo: null,
  pricePerCubicMeter: "8500",
  pricePerPerson: "80000",
  vatRate: "0.05",
  environmentalFeeRate: "0.10",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

const VALID_WATER_BODY = {
  name: "Biểu giá nước",
  effectiveFrom: "2026-10-01",
  effectiveTo: null,
  pricePerCubicMeter: "8500",
  pricePerPerson: "80000",
  vatRate: "0.05",
  environmentalFeeRate: "0.10",
};

function fakeWaterService(overrides: {
  list?: Result<WaterTariff[]>;
  create?: Result<WaterTariff>;
  update?: Result<WaterTariff>;
  delete?: Result<{ id: string }>;
}) {
  return {
    async list(): Promise<Result<WaterTariff[]>> {
      return overrides.list ?? ok([SAMPLE_WATER]);
    },
    async create(_input: CreateWaterTariffInput): Promise<Result<WaterTariff>> {
      return overrides.create ?? ok(SAMPLE_WATER);
    },
    async update(_id: string, _input: UpdateWaterTariffInput): Promise<Result<WaterTariff>> {
      return overrides.update ?? ok(SAMPLE_WATER);
    },
    async delete(_id: string): Promise<Result<{ id: string }>> {
      return overrides.delete ?? ok({ id: SAMPLE_WATER.id });
    },
  };
}

// ---- Electricity ----

test("GET tariffs/electricity: 200, effectiveFrom 'YYYY-MM-DD'", async () => {
  const controller = createListElectricityTariffsController(() => fakeElectricityService({}));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest(), res);
  assert.equal(state.statusCode, 200);
  const body = state.body as { data: Array<{ tariff: { effectiveFrom: string } } > };
  assert.equal(body.data[0].tariff.effectiveFrom, "2026-10-01");
});

test("POST tariffs/electricity: hợp lệ -> 201", async () => {
  const controller = createCreateElectricityTariffController(() => fakeElectricityService({}));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ body: VALID_ELECTRICITY_BODY }), res);
  assert.equal(state.statusCode, 201);
});

test("POST tariffs/electricity: tiers không phải mảng -> 400", async () => {
  const controller = createCreateElectricityTariffController(() => fakeElectricityService({}));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ body: { ...VALID_ELECTRICITY_BODY, tiers: "not-an-array" } }), res);
  assert.equal(state.statusCode, 400);
});

test("POST tariffs/electricity: effectiveFrom sai hình dạng -> 400", async () => {
  const controller = createCreateElectricityTariffController(() => fakeElectricityService({}));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ body: { ...VALID_ELECTRICITY_BODY, effectiveFrom: "10-01-2026" } }), res);
  assert.equal(state.statusCode, 400);
});

test("POST tariffs/electricity: effectiveFrom KHÔNG bắt buộc ngày 01 (khác billingPeriod) -> 201", async () => {
  const controller = createCreateElectricityTariffController(() => fakeElectricityService({}));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ body: { ...VALID_ELECTRICITY_BODY, effectiveFrom: "2025-05-10" } }), res);
  assert.equal(state.statusCode, 201);
});

test("POST tariffs/electricity: Service trả TARIFF_PERIOD_OVERLAP -> 409", async () => {
  const controller = createCreateElectricityTariffController(() =>
    fakeElectricityService({ create: fail("TARIFF_PERIOD_OVERLAP", "chồng lấn") })
  );
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ body: VALID_ELECTRICITY_BODY }), res);
  assert.equal(state.statusCode, 409);
});

test("PUT tariffs/electricity/:tariffId: Service trả TARIFF_IN_USE -> 409", async () => {
  const controller = createUpdateElectricityTariffController(() =>
    fakeElectricityService({ update: fail("TARIFF_IN_USE", "đã tham chiếu") })
  );
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ body: VALID_ELECTRICITY_BODY, params: { tariffId: "1" } }), res);
  assert.equal(state.statusCode, 409);
});

test("PUT tariffs/electricity/:tariffId: Service trả DUPLICATE_TIER_NUMBER -> 422", async () => {
  const controller = createUpdateElectricityTariffController(() =>
    fakeElectricityService({ update: fail("DUPLICATE_TIER_NUMBER", "trùng bậc") })
  );
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ body: VALID_ELECTRICITY_BODY, params: { tariffId: "1" } }), res);
  assert.equal(state.statusCode, 422);
});

test("DELETE tariffs/electricity/:tariffId: hợp lệ -> 200 với { id }", async () => {
  const controller = createDeleteElectricityTariffController(() => fakeElectricityService({}));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ params: { tariffId: "1" } }), res);
  assert.equal(state.statusCode, 200);
  const body = state.body as { data: { id: string } };
  assert.equal(body.data.id, "1");
});

test("DELETE tariffs/electricity/:tariffId: Service trả TARIFF_IN_USE -> 409", async () => {
  const controller = createDeleteElectricityTariffController(() =>
    fakeElectricityService({ delete: fail("TARIFF_IN_USE", "đã tham chiếu") })
  );
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ params: { tariffId: "1" } }), res);
  assert.equal(state.statusCode, 409);
});

test("DELETE tariffs/electricity/:tariffId: Service trả TARIFF_NOT_FOUND -> 404", async () => {
  const controller = createDeleteElectricityTariffController(() =>
    fakeElectricityService({ delete: fail("TARIFF_NOT_FOUND", "không tìm thấy") })
  );
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ params: { tariffId: "999" } }), res);
  assert.equal(state.statusCode, 404);
});

// ---- Water ----

test("GET tariffs/water: 200", async () => {
  const controller = createListWaterTariffsController(() => fakeWaterService({}));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest(), res);
  assert.equal(state.statusCode, 200);
});

test("POST tariffs/water: hợp lệ -> 201", async () => {
  const controller = createCreateWaterTariffController(() => fakeWaterService({}));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ body: VALID_WATER_BODY }), res);
  assert.equal(state.statusCode, 201);
});

test("POST tariffs/water: thiếu vatRate -> 400", async () => {
  const controller = createCreateWaterTariffController(() => fakeWaterService({}));
  const { vatRate: _omit, ...bodyWithoutVatRate } = VALID_WATER_BODY;
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ body: bodyWithoutVatRate }), res);
  assert.equal(state.statusCode, 400);
});

test("PUT tariffs/water/:tariffId: hợp lệ -> 200", async () => {
  const controller = createUpdateWaterTariffController(() => fakeWaterService({}));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ body: VALID_WATER_BODY, params: { tariffId: "1" } }), res);
  assert.equal(state.statusCode, 200);
});

test("PUT tariffs/water/:tariffId: Service trả TARIFF_IN_USE -> 409", async () => {
  const controller = createUpdateWaterTariffController(() => fakeWaterService({ update: fail("TARIFF_IN_USE", "đã tham chiếu") }));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ body: VALID_WATER_BODY, params: { tariffId: "1" } }), res);
  assert.equal(state.statusCode, 409);
});

test("DELETE tariffs/water/:tariffId: hợp lệ -> 200 với { id }", async () => {
  const controller = createDeleteWaterTariffController(() => fakeWaterService({}));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ params: { tariffId: "1" } }), res);
  assert.equal(state.statusCode, 200);
  const body = state.body as { data: { id: string } };
  assert.equal(body.data.id, "1");
});

test("DELETE tariffs/water/:tariffId: Service trả TARIFF_IN_USE -> 409", async () => {
  const controller = createDeleteWaterTariffController(() => fakeWaterService({ delete: fail("TARIFF_IN_USE", "đã tham chiếu") }));
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest({ params: { tariffId: "1" } }), res);
  assert.equal(state.statusCode, 409);
});

test("getService() throw -> 500 INTERNAL_ERROR", async () => {
  const controller = createListWaterTariffsController(() => {
    throw new Error("DATABASE_URL missing");
  });
  const { res, state } = createFakeResponse();
  await controller(createFakeRequest(), res);
  assert.equal(state.statusCode, 500);
  const body = state.body as { error: { code: string } };
  assert.equal(body.error.code, "INTERNAL_ERROR");
});
