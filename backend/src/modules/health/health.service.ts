// SPDX-License-Identifier: MIT

import { Result, ok } from "../../shared/result";

export interface HealthStatus {
  status: "ok";
}

/**
 * Responsibility:
 * Xác định và trả về trạng thái "khỏe mạnh" hiện tại của backend.
 *
 * Expected input: không có.
 * Expected output: Result<HealthStatus>, luôn success=true ở bước
 * foundation này (chưa kiểm tra dependency nào khác).
 *
 * Does NOT:
 * - kiểm tra kết nối PostgreSQL/Supabase (chưa cần ở bước foundation,
 *   sẽ bổ sung khi database được tích hợp)
 * - chứa logic HTTP (status code, header, response shape...)
 *
 * Reason:
 * Health service minh hoạ ranh giới Service/Orchestrator: nó không
 * biết gì về Express request/response, chỉ trả về dữ liệu domain
 * thuần tuý theo Result contract, nên có thể test độc lập với HTTP.
 */
export function getHealthStatus(): Result<HealthStatus> {
  return ok({ status: "ok" });
}
