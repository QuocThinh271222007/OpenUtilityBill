// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../shared/result";
import { isPositiveIntegerId } from "../../shared/validation/id";
import { isExactDecimalWithinScale } from "../../shared/validation/decimal-scale";
import { isValidRateShape, isValidRateValue } from "./tariff-rate-validation";
import { periodsOverlap } from "./tariff-period-overlap";
import { validateElectricityConfig } from "../../calculation/electricity/validate-electricity-config";
import { calculateQuotaFactor } from "../../calculation/electricity/calculate-quota-factor";
import { ElectricityTariffRepository, NewElectricityTariffTier } from "../../repositories/electricity-tariff.repository";
import {
  CreateElectricityTariffInput,
  ElectricityTariffManagementDependencies,
  ElectricityTariffWithTiers,
  UpdateElectricityTariffInput,
} from "./electricity-tariff-management.types";

/**
 * Trách nhiệm:
 * Business validation + orchestration cho quản lý cấu hình
 * ElectricityTariff (parent + tiers, một AGGREGATE) — `list`/`create`/
 * `update`. Xem docs/MANAGEMENT_API.md mục "Electricity tariff
 * aggregate transaction" cho sơ đồ đầy đủ.
 *
 * Điều kiện lỗi:
 * - `VALIDATION_ERROR`: hình dạng sai (name rỗng, ngày hiệu lực,
 *   electricityVatRate ngoài `NUMERIC(5,4)`/đoạn [0,1],
 *   peoplePerQuotaUnit/fallbackTierNumber không phải số nguyên dương,
 *   id sai hình dạng BIGINT khi update).
 * - `EMPTY_TARIFF`/`INVALID_TIER_NUMBER`/`DUPLICATE_TIER_NUMBER`/
 *   `INVALID_TIER_PRICE`/`INVALID_TIER_THRESHOLD`/`NO_UNLIMITED_TIER`/
 *   `MULTIPLE_UNLIMITED_TIERS`/`UNLIMITED_TIER_NOT_LAST`: propagate từ
 *   Calculation Core (`validateElectricityConfig`) — KHÔNG viết lại quy
 *   tắc cấu trúc tier.
 * - `INVALID_PEOPLE_PER_QUOTA_UNIT`: propagate từ Calculation Core
 *   (`calculateQuotaFactor`, gọi với `tenantCount = 1` — một giá trị
 *   dương AN TOÀN chỉ để kiểm tra `peoplePerQuotaUnit` tạo quotaFactor
 *   hữu hạn hay không, không liên quan phòng thật nào).
 * - `TARIFF_CONFIGURATION_INVALID`: `fallbackTierNumber` không khớp
 *   `tierNumber` nào trong `tiers` đã gửi.
 * - `TARIFF_PERIOD_OVERLAP`: khoảng hiệu lực chồng lấn một tariff khác
 *   (loại trừ chính tariff đang sửa khi `update`).
 * - `create`: `TARIFF_ALREADY_EXISTS` propagate khi vi phạm
 *   `UNIQUE(name, effective_from)`.
 * - `update`: `TARIFF_IN_USE` khi tariff đã được một invoice tham
 *   chiếu — xem docs/MANAGEMENT_API.md mục "Historical tariff
 *   protection".
 *
 * Important invariant — atomic parent + tiers:
 * `create`/`update` luôn ghi qua `electricityTariffUnitOfWork.run(...)`
 * — bên trong MỘT transaction, `createTariff`/`updateTariffParent` rồi
 * `replaceTiers` cùng chạy hoặc cùng rollback. KHÔNG BAO GIỜ gọi hai
 * thao tác đó qua `electricityTariffRepository` (chỉ dùng cho đọc) —
 * xem `electricity-tariff-management.types.ts`.
 *
 * Không chịu trách nhiệm:
 * - hard-code số lượng bậc hay bất kỳ hằng số biểu giá cụ thể nào.
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

/** `NUMERIC(12, 2)`: tối đa 10 chữ số nguyên, 2 chữ số thập phân. */
function isValidThresholdShape(value: string): boolean {
  return isExactDecimalWithinScale(value, { maxIntegerDigits: 10, maxFractionalDigits: 2 });
}

/** `NUMERIC(14, 2)`: tối đa 12 chữ số nguyên, 2 chữ số thập phân. */
function isValidUnitPriceShape(value: string): boolean {
  return isExactDecimalWithinScale(value, { maxIntegerDigits: 12, maxFractionalDigits: 2 });
}

interface ValidatedElectricityTariffInput {
  name: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  electricityVatRate: string;
  peoplePerQuotaUnit: number;
  fallbackTierNumber: number;
  tiers: NewElectricityTariffTier[];
}

function validateInput(
  input: CreateElectricityTariffInput | UpdateElectricityTariffInput
): Result<ValidatedElectricityTariffInput> {
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

  if (!isValidRateShape(input.electricityVatRate) || !isValidRateValue(input.electricityVatRate)) {
    return fail(
      "VALIDATION_ERROR",
      `electricityVatRate không hợp lệ: "${input.electricityVatRate}" (phải là chuỗi thập phân trong đoạn [0, 1], tối đa 4 chữ số thập phân).`
    );
  }

  if (!Number.isInteger(input.peoplePerQuotaUnit) || input.peoplePerQuotaUnit <= 0) {
    return fail("VALIDATION_ERROR", `peoplePerQuotaUnit phải là số nguyên dương: ${input.peoplePerQuotaUnit}.`);
  }
  if (!Number.isInteger(input.fallbackTierNumber) || input.fallbackTierNumber <= 0) {
    return fail("VALIDATION_ERROR", `fallbackTierNumber phải là số nguyên dương: ${input.fallbackTierNumber}.`);
  }

  for (const tier of input.tiers) {
    if (tier.thresholdKwh !== null && !isValidThresholdShape(tier.thresholdKwh)) {
      return fail(
        "VALIDATION_ERROR",
        `thresholdKwh không hợp lệ ở tier ${tier.tierNumber}: "${tier.thresholdKwh}" (phải là null hoặc chuỗi thập phân không âm, tối đa 10 chữ số nguyên và 2 chữ số thập phân).`
      );
    }
    if (!isValidUnitPriceShape(tier.unitPrice)) {
      return fail(
        "VALIDATION_ERROR",
        `unitPrice không hợp lệ ở tier ${tier.tierNumber}: "${tier.unitPrice}" (phải là chuỗi thập phân không âm, tối đa 12 chữ số nguyên và 2 chữ số thập phân).`
      );
    }
  }

  // Cấu trúc tier (không rỗng, tierNumber dương/không trùng, đúng một
  // bậc không giới hạn là bậc cuối, ...) — TÁI SỬ DỤNG Calculation Core,
  // không viết lại quy tắc.
  const validatedTiersResult = validateElectricityConfig(input.tiers);
  if (!validatedTiersResult.success) {
    return validatedTiersResult;
  }

  if (!input.tiers.some((tier) => tier.tierNumber === input.fallbackTierNumber)) {
    return fail(
      "TARIFF_CONFIGURATION_INVALID",
      `fallbackTierNumber = ${input.fallbackTierNumber} không khớp bất kỳ tierNumber nào trong tiers đã gửi.`
    );
  }

  // peoplePerQuotaUnit phải tạo quotaFactor hữu hạn với MỌI tenantCount
  // — kiểm tra bằng calculateQuotaFactor với tenantCount = 1 (giá trị
  // dương an toàn, không phải phòng thật nào) TÁI SỬ DỤNG đúng quy tắc
  // calculateQuotaFactorExact đã dùng khi tính hoá đơn thật, không phát
  // minh một quy tắc thứ hai (xem docs/MANAGEMENT_API.md).
  const quotaCheckResult = calculateQuotaFactor({ tenantCount: 1, peoplePerQuotaUnit: input.peoplePerQuotaUnit });
  if (!quotaCheckResult.success) {
    return quotaCheckResult;
  }

  return ok({
    name: nameResult.data,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo,
    electricityVatRate: input.electricityVatRate,
    peoplePerQuotaUnit: input.peoplePerQuotaUnit,
    fallbackTierNumber: input.fallbackTierNumber,
    tiers: input.tiers.map((tier) => ({ tierNumber: tier.tierNumber, thresholdKwh: tier.thresholdKwh, unitPrice: tier.unitPrice })),
  });
}

async function checkNoOverlap(
  repository: ElectricityTariffRepository,
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
    return fail("TARIFF_PERIOD_OVERLAP", `Khoảng hiệu lực chồng lấn với electricity tariff id = ${conflict.id}.`);
  }
  return ok(null);
}

export class ElectricityTariffManagementService {
  constructor(private readonly deps: ElectricityTariffManagementDependencies) {}

  async list(): Promise<Result<ElectricityTariffWithTiers[]>> {
    return this.deps.electricityTariffRepository.listAll();
  }

  async create(input: CreateElectricityTariffInput): Promise<Result<ElectricityTariffWithTiers>> {
    const validatedResult = validateInput(input);
    if (!validatedResult.success) {
      return validatedResult;
    }
    const validated = validatedResult.data;

    const overlapResult = await checkNoOverlap(
      this.deps.electricityTariffRepository,
      validated.effectiveFrom,
      validated.effectiveTo,
      null
    );
    if (!overlapResult.success) {
      return overlapResult;
    }

    return this.deps.electricityTariffUnitOfWork.run(async (repository) => {
      const tariffResult = await repository.createTariff({
        name: validated.name,
        effectiveFrom: validated.effectiveFrom,
        effectiveTo: validated.effectiveTo,
        electricityVatRate: validated.electricityVatRate,
        peoplePerQuotaUnit: validated.peoplePerQuotaUnit,
        fallbackTierNumber: validated.fallbackTierNumber,
      });
      if (!tariffResult.success) {
        return tariffResult;
      }

      const tiersResult = await repository.replaceTiers(tariffResult.data.id, validated.tiers);
      if (!tiersResult.success) {
        return tiersResult;
      }

      return ok({ tariff: tariffResult.data, tiers: tiersResult.data });
    });
  }

  async update(id: string, input: UpdateElectricityTariffInput): Promise<Result<ElectricityTariffWithTiers>> {
    if (!isPositiveIntegerId(id)) {
      return fail("VALIDATION_ERROR", `tariffId không hợp lệ (phải là chuỗi số nguyên dương): "${id}".`);
    }

    const validatedResult = validateInput(input);
    if (!validatedResult.success) {
      return validatedResult;
    }
    const validated = validatedResult.data;

    const referencedResult = await this.deps.electricityTariffRepository.isReferencedByInvoice(id);
    if (!referencedResult.success) {
      return referencedResult;
    }
    if (referencedResult.data) {
      return fail("TARIFF_IN_USE", `Electricity tariff với id = ${id} đã được một invoice tham chiếu, không thể sửa.`);
    }

    const overlapResult = await checkNoOverlap(
      this.deps.electricityTariffRepository,
      validated.effectiveFrom,
      validated.effectiveTo,
      id
    );
    if (!overlapResult.success) {
      return overlapResult;
    }

    return this.deps.electricityTariffUnitOfWork.run(async (repository) => {
      const tariffResult = await repository.updateTariffParent(id, {
        name: validated.name,
        effectiveFrom: validated.effectiveFrom,
        effectiveTo: validated.effectiveTo,
        electricityVatRate: validated.electricityVatRate,
        peoplePerQuotaUnit: validated.peoplePerQuotaUnit,
        fallbackTierNumber: validated.fallbackTierNumber,
      });
      if (!tariffResult.success) {
        return tariffResult;
      }

      const tiersResult = await repository.replaceTiers(id, validated.tiers);
      if (!tiersResult.success) {
        return tiersResult;
      }

      return ok({ tariff: tariffResult.data, tiers: tiersResult.data });
    });
  }
}
