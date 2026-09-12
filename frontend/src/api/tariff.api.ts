// SPDX-License-Identifier: MIT

import { apiRequest } from "./api-client";
import type { ApiResult } from "../types/api.types";
import type { ElectricityTariffBody, ElectricityTariffWithTiers, WaterTariff, WaterTariffBody } from "../types/tariff.types";

/** Trách nhiệm: gọi REST API cho cấu hình biểu giá điện/nước. Không chịu trách nhiệm: validate cấu hình bậc/tỉ lệ — backend là nơi xác thực duy nhất. */
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

export function deleteElectricityTariff(id: string): Promise<ApiResult<{ id: string }>> {
  return apiRequest<{ id: string }>(`/tariffs/electricity/${encodeURIComponent(id)}`, { method: "DELETE" });
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

export function deleteWaterTariff(id: string): Promise<ApiResult<{ id: string }>> {
  return apiRequest<{ id: string }>(`/tariffs/water/${encodeURIComponent(id)}`, { method: "DELETE" });
}
