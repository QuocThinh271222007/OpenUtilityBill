// SPDX-License-Identifier: MIT

import { apiRequest } from "./api-client";
import type { ApiResult } from "../types/api.types";
import type { ElectricityTariffBody, ElectricityTariffWithTiers, WaterTariff, WaterTariffBody } from "../types/tariff.types";

/** Responsibility: gọi REST API cho cấu hình biểu giá điện/nước. Does NOT: validate cấu hình bậc/tỉ lệ — backend là nơi xác thực duy nhất. */
export function fetchElectricityTariffs(): Promise<ApiResult<ElectricityTariffWithTiers[]>> {
  return apiRequest<ElectricityTariffWithTiers[]>("/tariffs/electricity");
}

export function createElectricityTariff(body: ElectricityTariffBody): Promise<ApiResult<ElectricityTariffWithTiers>> {
  return apiRequest<ElectricityTariffWithTiers>("/tariffs/electricity", { method: "POST", body: JSON.stringify(body) });
}

export function updateElectricityTariff(id: string, body: ElectricityTariffBody): Promise<ApiResult<ElectricityTariffWithTiers>> {
  return apiRequest<ElectricityTariffWithTiers>(`/tariffs/electricity/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function fetchWaterTariffs(): Promise<ApiResult<WaterTariff[]>> {
  return apiRequest<WaterTariff[]>("/tariffs/water");
}

export function createWaterTariff(body: WaterTariffBody): Promise<ApiResult<WaterTariff>> {
  return apiRequest<WaterTariff>("/tariffs/water", { method: "POST", body: JSON.stringify(body) });
}

export function updateWaterTariff(id: string, body: WaterTariffBody): Promise<ApiResult<WaterTariff>> {
  return apiRequest<WaterTariff>(`/tariffs/water/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) });
}
