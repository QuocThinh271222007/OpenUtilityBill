// SPDX-License-Identifier: MIT

import { apiRequest } from "./api-client";
import type { ApiResult } from "../types/api.types";
import type { MeterReading, MeterReadingBody } from "../types/meter-reading.types";

/** Trách nhiệm: gọi REST API cho `MeterReading`. Không chịu trách nhiệm: thao tác DOM, kiểm tra rollover/hợp lệ (đó là việc của backend). */
export function fetchMeterReadings(roomId: string, billingPeriod?: string): Promise<ApiResult<MeterReading[]>> {
  const params = new URLSearchParams({ roomId });
  if (billingPeriod) {
    params.set("billingPeriod", billingPeriod);
  }
  return apiRequest<MeterReading[]>(`/meter-readings?${params.toString()}`);
}

export function createMeterReading(body: MeterReadingBody): Promise<ApiResult<MeterReading>> {
  return apiRequest<MeterReading>("/meter-readings", { method: "POST", body: JSON.stringify(body) });
}

export function updateMeterReading(id: string, body: MeterReadingBody): Promise<ApiResult<MeterReading>> {
  return apiRequest<MeterReading>(`/meter-readings/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) });
}

export function deleteMeterReading(id: string): Promise<ApiResult<{ id: string }>> {
  return apiRequest<{ id: string }>(`/meter-readings/${encodeURIComponent(id)}`, { method: "DELETE" });
}
