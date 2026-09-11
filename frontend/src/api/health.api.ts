// SPDX-License-Identifier: MIT

import { apiRequest } from "./api-client";
import type { ApiResult, HealthStatus } from "../types/health.types";

/**
 * Responsibility:
 * Gọi REST API GET /api/v1/health và trả về kết quả thô theo
 * ApiResult contract (chưa xử lý hiển thị).
 *
 * Does NOT:
 * - thao tác DOM
 * - quyết định hiển thị gì cho người dùng (việc đó thuộc về View)
 *
 * Reason:
 * Tách lời gọi API khỏi việc hiển thị giúp có thể đổi UI, hoặc viết
 * test cho phần gọi mạng, mà không cần sửa logic hiển thị.
 */
export function fetchHealth(): Promise<ApiResult<HealthStatus>> {
  return apiRequest<HealthStatus>("/health");
}
