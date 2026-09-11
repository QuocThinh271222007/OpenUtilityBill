// SPDX-License-Identifier: MIT

export type { ApiError, ApiResult } from "./api.types";

/**
 * Responsibility:
 * Type mô tả dữ liệu trả về từ `GET /api/v1/health`.
 *
 * Does NOT: validate dữ liệu tại runtime.
 */
export interface HealthStatus {
  status: "ok";
}
