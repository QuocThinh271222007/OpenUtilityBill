// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../../shared/result";
import { ElectricityTariff, ElectricityTariffTier, WaterTariff } from "../tariff.model";
import {
  ElectricityTariffRepository,
  ElectricityTariffWithTiers,
  NewElectricityTariff,
  NewElectricityTariffTier,
  UpdateElectricityTariffParent,
} from "../../../repositories/electricity-tariff.repository";
import { ElectricityTariffUnitOfWork } from "../../../repositories/electricity-tariff-unit-of-work";
import { NewWaterTariff, UpdateWaterTariff, WaterTariffRepository } from "../../../repositories/water-tariff.repository";
import { TariffEffectivePeriod } from "../../../repositories/tariff-shared.types";

// ---- Electricity ----

export interface FakeElectricityTariffRepositoryOptions {
  tariffs?: ElectricityTariffWithTiers[];
  createTariffResult?: Result<ElectricityTariff>;
  replaceTiersResult?: Result<ElectricityTariffTier[]>;
  updateTariffParentResult?: Result<ElectricityTariff>;
  isReferencedByInvoiceResult?: Result<boolean>;
  deleteResult?: Result<{ id: string }>;
}

export interface FakeElectricityTariffRepository extends ElectricityTariffRepository {
  readonly createTariffCalls: NewElectricityTariff[];
  readonly replaceTiersCalls: Array<{ tariffId: string; tiers: NewElectricityTariffTier[] }>;
  readonly updateTariffParentCalls: Array<{ id: string; input: UpdateElectricityTariffParent }>;
  readonly deleteCalls: string[];
}

export function createFakeElectricityTariffRepository(
  options: FakeElectricityTariffRepositoryOptions = {}
): FakeElectricityTariffRepository {
  const tariffs = options.tariffs ?? [];
  const createTariffCalls: NewElectricityTariff[] = [];
  const replaceTiersCalls: Array<{ tariffId: string; tiers: NewElectricityTariffTier[] }> = [];
  const updateTariffParentCalls: Array<{ id: string; input: UpdateElectricityTariffParent }> = [];
  const deleteCalls: string[] = [];
  let nextTariffId = 100;
  let nextTierId = 1000;

  return {
    createTariffCalls,
    replaceTiersCalls,
    updateTariffParentCalls,
    deleteCalls,

    async findApplicableTariffForPeriod(billingPeriod: Date): Promise<Result<ElectricityTariffWithTiers>> {
      const matches = tariffs.filter(
        (t) => t.tariff.effectiveFrom.getTime() <= billingPeriod.getTime() && (t.tariff.effectiveTo === null || t.tariff.effectiveTo.getTime() >= billingPeriod.getTime())
      );
      if (matches.length === 0) return fail("TARIFF_NOT_FOUND", "không tìm thấy");
      if (matches.length > 1) return fail("AMBIGUOUS_TARIFF_CONFIGURATION", "mơ hồ");
      return ok(matches[0]);
    },

    async listAll(): Promise<Result<ElectricityTariffWithTiers[]>> {
      return ok(tariffs);
    },

    async listEffectivePeriods(): Promise<Result<TariffEffectivePeriod[]>> {
      return ok(tariffs.map((t) => ({ id: t.tariff.id, effectiveFrom: t.tariff.effectiveFrom, effectiveTo: t.tariff.effectiveTo })));
    },

    async isReferencedByInvoice(_tariffId: string): Promise<Result<boolean>> {
      return options.isReferencedByInvoiceResult ?? ok(false);
    },

    async createTariff(input: NewElectricityTariff): Promise<Result<ElectricityTariff>> {
      createTariffCalls.push(input);
      if (options.createTariffResult) return options.createTariffResult;
      const created: ElectricityTariff = {
        id: String(nextTariffId++),
        name: input.name,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo,
        electricityVatRate: input.electricityVatRate,
        peoplePerQuotaUnit: input.peoplePerQuotaUnit,
        fallbackTierNumber: input.fallbackTierNumber,
        createdAt: new Date("2026-01-10T00:00:00.000Z"),
      };
      tariffs.push({ tariff: created, tiers: [] });
      return ok(created);
    },

    async replaceTiers(tariffId: string, tiers: NewElectricityTariffTier[]): Promise<Result<ElectricityTariffTier[]>> {
      replaceTiersCalls.push({ tariffId, tiers });
      if (options.replaceTiersResult) return options.replaceTiersResult;
      const created = tiers.map((tier) => ({ id: String(nextTierId++), tariffId, tierNumber: tier.tierNumber, thresholdKwh: tier.thresholdKwh, unitPrice: tier.unitPrice }));
      const entry = tariffs.find((t) => t.tariff.id === tariffId);
      if (entry) entry.tiers = created;
      return ok(created);
    },

    async updateTariffParent(id: string, input: UpdateElectricityTariffParent): Promise<Result<ElectricityTariff>> {
      updateTariffParentCalls.push({ id, input });
      if (options.updateTariffParentResult) return options.updateTariffParentResult;
      const entry = tariffs.find((t) => t.tariff.id === id);
      if (!entry) return fail("TARIFF_NOT_FOUND", `Không tìm thấy electricity tariff với id = ${id}.`);
      entry.tariff = { ...entry.tariff, ...input };
      return ok(entry.tariff);
    },

    async deleteById(id: string): Promise<Result<{ id: string }>> {
      deleteCalls.push(id);
      if (options.deleteResult) return options.deleteResult;
      const index = tariffs.findIndex((t) => t.tariff.id === id);
      if (index === -1) return fail("TARIFF_NOT_FOUND", `Không tìm thấy electricity tariff với id = ${id}.`);
      tariffs.splice(index, 1);
      return ok({ id });
    },
  };
}

export function createFakeElectricityTariffUnitOfWork(repository: ElectricityTariffRepository): {
  unitOfWork: ElectricityTariffUnitOfWork;
  state: { runCallCount: number };
} {
  const state = { runCallCount: 0 };
  const unitOfWork: ElectricityTariffUnitOfWork = {
    async run<T>(work: (repository: ElectricityTariffRepository) => Promise<Result<T>>): Promise<Result<T>> {
      state.runCallCount += 1;
      return work(repository);
    },
  };
  return { unitOfWork, state };
}

// ---- Water ----

export interface FakeWaterTariffRepositoryOptions {
  tariffs?: WaterTariff[];
  createResult?: Result<WaterTariff>;
  updateResult?: Result<WaterTariff>;
  isReferencedByInvoiceResult?: Result<boolean>;
  deleteResult?: Result<{ id: string }>;
}

export interface FakeWaterTariffRepository extends WaterTariffRepository {
  readonly createCalls: NewWaterTariff[];
  readonly updateCalls: Array<{ id: string; input: UpdateWaterTariff }>;
  readonly deleteCalls: string[];
}

export function createFakeWaterTariffRepository(options: FakeWaterTariffRepositoryOptions = {}): FakeWaterTariffRepository {
  const tariffs = options.tariffs ?? [];
  const createCalls: NewWaterTariff[] = [];
  const updateCalls: Array<{ id: string; input: UpdateWaterTariff }> = [];
  const deleteCalls: string[] = [];
  let nextId = 100;

  return {
    createCalls,
    updateCalls,
    deleteCalls,

    async findApplicableTariffForPeriod(billingPeriod: Date): Promise<Result<WaterTariff>> {
      const matches = tariffs.filter(
        (t) => t.effectiveFrom.getTime() <= billingPeriod.getTime() && (t.effectiveTo === null || t.effectiveTo.getTime() >= billingPeriod.getTime())
      );
      if (matches.length === 0) return fail("TARIFF_NOT_FOUND", "không tìm thấy");
      if (matches.length > 1) return fail("AMBIGUOUS_TARIFF_CONFIGURATION", "mơ hồ");
      return ok(matches[0]);
    },

    async listAll(): Promise<Result<WaterTariff[]>> {
      return ok(tariffs);
    },

    async listEffectivePeriods(): Promise<Result<TariffEffectivePeriod[]>> {
      return ok(tariffs.map((t) => ({ id: t.id, effectiveFrom: t.effectiveFrom, effectiveTo: t.effectiveTo })));
    },

    async isReferencedByInvoice(_tariffId: string): Promise<Result<boolean>> {
      return options.isReferencedByInvoiceResult ?? ok(false);
    },

    async create(input: NewWaterTariff): Promise<Result<WaterTariff>> {
      createCalls.push(input);
      if (options.createResult) return options.createResult;
      const created: WaterTariff = { id: String(nextId++), ...input, createdAt: new Date("2026-01-10T00:00:00.000Z") };
      tariffs.push(created);
      return ok(created);
    },

    async update(id: string, input: UpdateWaterTariff): Promise<Result<WaterTariff>> {
      updateCalls.push({ id, input });
      if (options.updateResult) return options.updateResult;
      const found = tariffs.find((t) => t.id === id);
      if (!found) return fail("TARIFF_NOT_FOUND", `Không tìm thấy water tariff với id = ${id}.`);
      Object.assign(found, input);
      return ok(found);
    },

    async deleteById(id: string): Promise<Result<{ id: string }>> {
      deleteCalls.push(id);
      if (options.deleteResult) return options.deleteResult;
      const index = tariffs.findIndex((t) => t.id === id);
      if (index === -1) return fail("TARIFF_NOT_FOUND", `Không tìm thấy water tariff với id = ${id}.`);
      tariffs.splice(index, 1);
      return ok({ id });
    },
  };
}
