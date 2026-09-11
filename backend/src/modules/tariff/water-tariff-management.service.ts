// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../shared/result";
import { isPositiveIntegerId } from "../../shared/validation/id";
import { isExactDecimalWithinScale } from "../../shared/validation/decimal-scale";
import { isValidRateShape, isValidRateValue } from "./tariff-rate-validation";
import { periodsOverlap } from "./tariff-period-overlap";
import { WaterTariff } from "./tariff.model";
import { WaterTariffRepository } from "../../repositories/water-tariff.repository";
import { CreateWaterTariffInput, UpdateWaterTariffInput, WaterTariffManagementDependencies } from "./water-tariff-management.types";

/**
 * Trách nhiệm:
 * Business validation + orchestration cho quản lý `WaterTariff` —
 * `list`/`create`/`update`. Đơn giản hơn ElectricityTariff vì
 * `water_tariffs` là MỘT bảng đơn — không cần Unit of Work (một câu
 * `INSERT`/`UPDATE` đã tự nguyên tử).
 *
 * Điều kiện lỗi:
 * - `VALIDATION_ERROR`: hình dạng sai (name rỗng, ngày hiệu lực, giá
 *   ngoài `NUMERIC(14,2)`, tỉ lệ ngoài `NUMERIC(5,4)`/đoạn [0,1], id sai
 *   hình dạng BIGINT khi update).
 * - `TARIFF_PERIOD_OVERLAP`: khoảng hiệu lực chồng lấn một tariff khác
 *   (loại trừ chính tariff đang sửa khi `update`) — xem
 *   `tariff-period-overlap.ts`.
 * - `create`: `TARIFF_ALREADY_EXISTS` propagate khi vi phạm
 *   `UNIQUE(name, effective_from)`.
 * - `update`: `TARIFF_IN_USE` khi tariff đã được một invoice tham
 *   chiếu.
 *
 * Không chịu trách nhiệm:
 * - chứa hằng số biểu giá nào của kỳ thi.
 * - chứa SQL/Postgres.js import.
 * - implement `delete`.
 */
function normalizeName(name: string): Result<string> {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return fail("VALIDATION_ERROR", "name không được rỗng.");
  }
  return ok(trimmed);
}

/** `NUMERIC(14, 2)`: tối đa 12 chữ số nguyên, 2 chữ số thập phân. */
function isValidPriceShape(value: string): boolean {
  return isExactDecimalWithinScale(value, { maxIntegerDigits: 12, maxFractionalDigits: 2 });
}

interface ValidatedWaterTariffInput {
  name: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  pricePerCubicMeter: string;
  pricePerPerson: string;
  vatRate: string;
  environmentalFeeRate: string;
}

function validateInput(input: CreateWaterTariffInput | UpdateWaterTariffInput): Result<ValidatedWaterTariffInput> {
  const nameResult = normalizeName(input.name);
  if (!nameResult.success) {
    return nameResult;
  }

  if (Number.isNaN(input.effectiveFrom.getTime())) {
    return fail("VALIDATION_ERROR", "effectiveFrom không phải một ngày hợp lệ.");
  }
  if (input.effectiveTo !== null) {
    if (Number.isNaN(input.effectiveTo.getTime())) {
      return fail("VALIDATION_ERROR", "effectiveTo không phải một ngày hợp lệ.");
    }
    if (input.effectiveTo.getTime() < input.effectiveFrom.getTime()) {
      return fail("VALIDATION_ERROR", "effectiveTo phải >= effectiveFrom khi có giá trị.");
    }
  }

  if (!isValidPriceShape(input.pricePerCubicMeter)) {
    return fail(
      "VALIDATION_ERROR",
      `pricePerCubicMeter không hợp lệ: "${input.pricePerCubicMeter}" (phải là chuỗi thập phân không âm, tối đa 12 chữ số nguyên và 2 chữ số thập phân).`
    );
  }
  if (!isValidPriceShape(input.pricePerPerson)) {
    return fail(
      "VALIDATION_ERROR",
      `pricePerPerson không hợp lệ: "${input.pricePerPerson}" (phải là chuỗi thập phân không âm, tối đa 12 chữ số nguyên và 2 chữ số thập phân).`
    );
  }
  if (!isValidRateShape(input.vatRate) || !isValidRateValue(input.vatRate)) {
    return fail(
      "VALIDATION_ERROR",
      `vatRate không hợp lệ: "${input.vatRate}" (phải là chuỗi thập phân trong đoạn [0, 1], tối đa 4 chữ số thập phân).`
    );
  }
  if (!isValidRateShape(input.environmentalFeeRate) || !isValidRateValue(input.environmentalFeeRate)) {
    return fail(
      "VALIDATION_ERROR",
      `environmentalFeeRate không hợp lệ: "${input.environmentalFeeRate}" (phải là chuỗi thập phân trong đoạn [0, 1], tối đa 4 chữ số thập phân).`
    );
  }

  return ok({
    name: nameResult.data,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo,
    pricePerCubicMeter: input.pricePerCubicMeter,
    pricePerPerson: input.pricePerPerson,
    vatRate: input.vatRate,
    environmentalFeeRate: input.environmentalFeeRate,
  });
}

async function checkNoOverlap(
  repository: WaterTariffRepository,
  effectiveFrom: Date,
  effectiveTo: Date | null,
  excludeId: string | null
): Promise<Result<null>> {
  const periodsResult = await repository.listEffectivePeriods();
  if (!periodsResult.success) {
    return periodsResult;
  }
  const conflict = periodsResult.data.find(
    (period) => period.id !== excludeId && periodsOverlap({ effectiveFrom, effectiveTo }, period)
  );
  if (conflict) {
    return fail("TARIFF_PERIOD_OVERLAP", `Khoảng hiệu lực chồng lấn với water tariff id = ${conflict.id}.`);
  }
  return ok(null);
}

export class WaterTariffManagementService {
  constructor(private readonly deps: WaterTariffManagementDependencies) {}

  async list(): Promise<Result<WaterTariff[]>> {
    return this.deps.waterTariffRepository.listAll();
  }

  async create(input: CreateWaterTariffInput): Promise<Result<WaterTariff>> {
    const validatedResult = validateInput(input);
    if (!validatedResult.success) {
      return validatedResult;
    }
    const validated = validatedResult.data;

    const overlapResult = await checkNoOverlap(this.deps.waterTariffRepository, validated.effectiveFrom, validated.effectiveTo, null);
    if (!overlapResult.success) {
      return overlapResult;
    }

    return this.deps.waterTariffRepository.create(validated);
  }

  async update(id: string, input: UpdateWaterTariffInput): Promise<Result<WaterTariff>> {
    if (!isPositiveIntegerId(id)) {
      return fail("VALIDATION_ERROR", `tariffId không hợp lệ (phải là chuỗi số nguyên dương): "${id}".`);
    }

    const validatedResult = validateInput(input);
    if (!validatedResult.success) {
      return validatedResult;
    }
    const validated = validatedResult.data;

    const referencedResult = await this.deps.waterTariffRepository.isReferencedByInvoice(id);
    if (!referencedResult.success) {
      return referencedResult;
    }
    if (referencedResult.data) {
      return fail("TARIFF_IN_USE", `Water tariff với id = ${id} đã được một invoice tham chiếu, không thể sửa.`);
    }

    const overlapResult = await checkNoOverlap(this.deps.waterTariffRepository, validated.effectiveFrom, validated.effectiveTo, id);
    if (!overlapResult.success) {
      return overlapResult;
    }

    return this.deps.waterTariffRepository.update(id, validated);
  }
}
