// SPDX-License-Identifier: MIT

import { Request, Response } from "express";
import { Result } from "../../shared/result";
import { mapResultErrorCodeToHttpStatus } from "../../shared/http/result-error-status";
import { parseDateWireFormat } from "../../shared/http/date-wire-format";
import { isPlainRequestBody, sendInternalError, sendValidationError } from "../../shared/http/controller-helpers";
import { WaterTariff } from "./tariff.model";
import { ElectricityTariffWithTiers } from "../../repositories/electricity-tariff.repository";
import { CreateElectricityTariffInput, ElectricityTariffTierInput, UpdateElectricityTariffInput } from "./electricity-tariff-management.types";
import { CreateWaterTariffInput, UpdateWaterTariffInput } from "./water-tariff-management.types";
import { serializeElectricityTariffWithTiers, serializeWaterTariff } from "./tariff.http";

/**
 * Trách nhiệm:
 * Nhận HTTP request cho `GET/POST /api/v1/tariffs/electricity`,
 * `PUT /api/v1/tariffs/electricity/:tariffId`, và tương ứng cho
 * `/api/v1/tariffs/water`. Cùng pattern dependency-injection với các
 * Controller khác trong dự án.
 *
 * Không chịu trách nhiệm:
 * - validate cấu trúc tier, tỉ lệ VAT, chồng lấn khoảng hiệu lực, hay
 *   tham chiếu lịch sử — tất cả thuộc
 *   `ElectricityTariffManagementService`/`WaterTariffManagementService`.
 *   Controller chỉ kiểm tra HÌNH DẠNG JS nguyên thuỷ và parse ngày.
 */
interface ElectricityTariffManagementServiceLike {
  list(): Promise<Result<ElectricityTariffWithTiers[]>>;
  create(input: CreateElectricityTariffInput): Promise<Result<ElectricityTariffWithTiers>>;
  update(id: string, input: UpdateElectricityTariffInput): Promise<Result<ElectricityTariffWithTiers>>;
}

interface WaterTariffManagementServiceLike {
  list(): Promise<Result<WaterTariff[]>>;
  create(input: CreateWaterTariffInput): Promise<Result<WaterTariff>>;
  update(id: string, input: UpdateWaterTariffInput): Promise<Result<WaterTariff>>;
}

function extractCommonTariffFields(
  body: Record<string, unknown>,
  res: Response
): { name: string; effectiveFrom: Date; effectiveTo: Date | null } | null {
  if (typeof body.name !== "string") {
    sendValidationError(res, "name là bắt buộc và phải là chuỗi.");
    return null;
  }

  const effectiveFromResult = parseDateWireFormat(body.effectiveFrom);
  if (!effectiveFromResult.success) {
    res.status(400).json({ success: false, error: effectiveFromResult.error });
    return null;
  }

  if (body.effectiveTo !== null && body.effectiveTo !== undefined) {
    const effectiveToResult = parseDateWireFormat(body.effectiveTo);
    if (!effectiveToResult.success) {
      res.status(400).json({ success: false, error: effectiveToResult.error });
      return null;
    }
    return { name: body.name, effectiveFrom: effectiveFromResult.data, effectiveTo: effectiveToResult.data };
  }

  return { name: body.name, effectiveFrom: effectiveFromResult.data, effectiveTo: null };
}

function extractTiers(body: Record<string, unknown>, res: Response): ElectricityTariffTierInput[] | null {
  if (!Array.isArray(body.tiers)) {
    sendValidationError(res, "tiers là bắt buộc và phải là một mảng.");
    return null;
  }

  const tiers: ElectricityTariffTierInput[] = [];
  for (const rawTier of body.tiers) {
    if (typeof rawTier !== "object" || rawTier === null || Array.isArray(rawTier)) {
      sendValidationError(res, "Mỗi phần tử của tiers phải là một object.");
      return null;
    }
    const tier = rawTier as Record<string, unknown>;
    if (typeof tier.tierNumber !== "number") {
      sendValidationError(res, "tierNumber của mỗi tier là bắt buộc và phải là số.");
      return null;
    }
    if (tier.thresholdKwh !== null && typeof tier.thresholdKwh !== "string") {
      sendValidationError(res, "thresholdKwh của mỗi tier phải là chuỗi hoặc null.");
      return null;
    }
    if (typeof tier.unitPrice !== "string") {
      sendValidationError(res, "unitPrice của mỗi tier là bắt buộc và phải là chuỗi.");
      return null;
    }
    tiers.push({ tierNumber: tier.tierNumber, thresholdKwh: tier.thresholdKwh, unitPrice: tier.unitPrice });
  }
  return tiers;
}

function extractElectricityTariffInput(req: Request, res: Response): CreateElectricityTariffInput | null {
  if (!isPlainRequestBody(req.body)) {
    sendValidationError(res, "Request body phải là một object JSON.");
    return null;
  }
  const body = req.body;

  const common = extractCommonTariffFields(body, res);
  if (common === null) {
    return null;
  }
  if (typeof body.electricityVatRate !== "string") {
    sendValidationError(res, "electricityVatRate là bắt buộc và phải là chuỗi.");
    return null;
  }
  if (typeof body.peoplePerQuotaUnit !== "number") {
    sendValidationError(res, "peoplePerQuotaUnit là bắt buộc và phải là số.");
    return null;
  }
  if (typeof body.fallbackTierNumber !== "number") {
    sendValidationError(res, "fallbackTierNumber là bắt buộc và phải là số.");
    return null;
  }
  const tiers = extractTiers(body, res);
  if (tiers === null) {
    return null;
  }

  return {
    name: common.name,
    effectiveFrom: common.effectiveFrom,
    effectiveTo: common.effectiveTo,
    electricityVatRate: body.electricityVatRate,
    peoplePerQuotaUnit: body.peoplePerQuotaUnit,
    fallbackTierNumber: body.fallbackTierNumber,
    tiers,
  };
}

function extractWaterTariffInput(req: Request, res: Response): CreateWaterTariffInput | null {
  if (!isPlainRequestBody(req.body)) {
    sendValidationError(res, "Request body phải là một object JSON.");
    return null;
  }
  const body = req.body;

  const common = extractCommonTariffFields(body, res);
  if (common === null) {
    return null;
  }
  if (typeof body.pricePerCubicMeter !== "string") {
    sendValidationError(res, "pricePerCubicMeter là bắt buộc và phải là chuỗi.");
    return null;
  }
  if (typeof body.pricePerPerson !== "string") {
    sendValidationError(res, "pricePerPerson là bắt buộc và phải là chuỗi.");
    return null;
  }
  if (typeof body.vatRate !== "string") {
    sendValidationError(res, "vatRate là bắt buộc và phải là chuỗi.");
    return null;
  }
  if (typeof body.environmentalFeeRate !== "string") {
    sendValidationError(res, "environmentalFeeRate là bắt buộc và phải là chuỗi.");
    return null;
  }

  return {
    name: common.name,
    effectiveFrom: common.effectiveFrom,
    effectiveTo: common.effectiveTo,
    pricePerCubicMeter: body.pricePerCubicMeter,
    pricePerPerson: body.pricePerPerson,
    vatRate: body.vatRate,
    environmentalFeeRate: body.environmentalFeeRate,
  };
}

// ---- Electricity ----

export function createListElectricityTariffsController(getService: () => ElectricityTariffManagementServiceLike) {
  return async function listElectricityTariffs(_req: Request, res: Response): Promise<void> {
    try {
      const result = await getService().list();
      if (!result.success) {
        res.status(mapResultErrorCodeToHttpStatus(result.error.code)).json({ success: false, error: result.error });
        return;
      }
      res.status(200).json({ success: true, data: result.data.map(serializeElectricityTariffWithTiers) });
    } catch (error) {
      sendInternalError("tariff.controller.listElectricityTariffs", error, res);
    }
  };
}

export function createCreateElectricityTariffController(getService: () => ElectricityTariffManagementServiceLike) {
  return async function createElectricityTariff(req: Request, res: Response): Promise<void> {
    try {
      const input = extractElectricityTariffInput(req, res);
      if (input === null) {
        return;
      }
      const result = await getService().create(input);
      if (!result.success) {
        res.status(mapResultErrorCodeToHttpStatus(result.error.code)).json({ success: false, error: result.error });
        return;
      }
      res.status(201).json({ success: true, data: serializeElectricityTariffWithTiers(result.data) });
    } catch (error) {
      sendInternalError("tariff.controller.createElectricityTariff", error, res);
    }
  };
}

export function createUpdateElectricityTariffController(getService: () => ElectricityTariffManagementServiceLike) {
  return async function updateElectricityTariff(req: Request, res: Response): Promise<void> {
    try {
      const input = extractElectricityTariffInput(req, res);
      if (input === null) {
        return;
      }
      const result = await getService().update(req.params.tariffId, input);
      if (!result.success) {
        res.status(mapResultErrorCodeToHttpStatus(result.error.code)).json({ success: false, error: result.error });
        return;
      }
      res.status(200).json({ success: true, data: serializeElectricityTariffWithTiers(result.data) });
    } catch (error) {
      sendInternalError("tariff.controller.updateElectricityTariff", error, res);
    }
  };
}

// ---- Water ----

export function createListWaterTariffsController(getService: () => WaterTariffManagementServiceLike) {
  return async function listWaterTariffs(_req: Request, res: Response): Promise<void> {
    try {
      const result = await getService().list();
      if (!result.success) {
        res.status(mapResultErrorCodeToHttpStatus(result.error.code)).json({ success: false, error: result.error });
        return;
      }
      res.status(200).json({ success: true, data: result.data.map(serializeWaterTariff) });
    } catch (error) {
      sendInternalError("tariff.controller.listWaterTariffs", error, res);
    }
  };
}

export function createCreateWaterTariffController(getService: () => WaterTariffManagementServiceLike) {
  return async function createWaterTariff(req: Request, res: Response): Promise<void> {
    try {
      const input = extractWaterTariffInput(req, res);
      if (input === null) {
        return;
      }
      const result = await getService().create(input);
      if (!result.success) {
        res.status(mapResultErrorCodeToHttpStatus(result.error.code)).json({ success: false, error: result.error });
        return;
      }
      res.status(201).json({ success: true, data: serializeWaterTariff(result.data) });
    } catch (error) {
      sendInternalError("tariff.controller.createWaterTariff", error, res);
    }
  };
}

export function createUpdateWaterTariffController(getService: () => WaterTariffManagementServiceLike) {
  return async function updateWaterTariff(req: Request, res: Response): Promise<void> {
    try {
      const input = extractWaterTariffInput(req, res);
      if (input === null) {
        return;
      }
      const result = await getService().update(req.params.tariffId, input);
      if (!result.success) {
        res.status(mapResultErrorCodeToHttpStatus(result.error.code)).json({ success: false, error: result.error });
        return;
      }
      res.status(200).json({ success: true, data: serializeWaterTariff(result.data) });
    } catch (error) {
      sendInternalError("tariff.controller.updateWaterTariff", error, res);
    }
  };
}
