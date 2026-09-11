// SPDX-License-Identifier: MIT

import { apiRequest } from "./api-client";
import type { ApiResult } from "../types/api.types";
import type { CreatePropertyBody, RentalProperty, UpdatePropertyBody } from "../types/property.types";

/** Responsibility: gọi REST API cho `RentalProperty`. Does NOT: thao tác DOM, quyết định hiển thị gì (việc của Controller/View). */
export function fetchProperties(): Promise<ApiResult<RentalProperty[]>> {
  return apiRequest<RentalProperty[]>("/properties");
}

export function createProperty(body: CreatePropertyBody): Promise<ApiResult<RentalProperty>> {
  return apiRequest<RentalProperty>("/properties", { method: "POST", body: JSON.stringify(body) });
}

export function updateProperty(id: string, body: UpdatePropertyBody): Promise<ApiResult<RentalProperty>> {
  return apiRequest<RentalProperty>(`/properties/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
}
