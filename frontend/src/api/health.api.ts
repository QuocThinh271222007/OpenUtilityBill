// SPDX-License-Identifier: MIT

import type { ApiResult, HealthStatus } from "../types/health.types";

const API_V1_PREFIX = "/api/v1";

/**
 * Responsibility:
 * Gọi REST API GET /api/v1/health và trả về kết quả thô theo
 * ApiResult contract (chưa xử lý hiển thị).
 *
 * Expected output:
 * ApiResult<HealthStatus> — success khi backend phản hồi đúng contract,
 * failure (code NETWORK_ERROR) khi không kết nối được tới backend.
 *
 * Does NOT:
 * - thao tác DOM
 * - quyết định hiển thị gì cho người dùng (việc đó thuộc về View)
 *
 * Reason:
 * Tách lời gọi API khỏi việc hiển thị giúp có thể đổi UI, hoặc viết
 * test cho phần gọi mạng, mà không cần sửa logic hiển thị.
 */
export async function fetchHealth(): Promise<ApiResult<HealthStatus>> {
  try {
    const response = await fetch(`${API_V1_PREFIX}/health`);
    return (await response.json()) as ApiResult<HealthStatus>;
  } catch {
    return {
      success: false,
      error: {
        code: "NETWORK_ERROR",
        message: "Không thể kết nối tới backend.",
      },
    };
  }
}
