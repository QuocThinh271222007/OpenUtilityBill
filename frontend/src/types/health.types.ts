// SPDX-License-Identifier: MIT

export type { ApiError, ApiResult } from "./api.types";

/**
 * Trách nhiệm:
 * Type mô tả dữ liệu trả về từ `GET /api/v1/health`.
 *
 * Không chịu trách nhiệm: validate dữ liệu tại runtime.
 */
export interface HealthStatus {
  status: "ok";
}
