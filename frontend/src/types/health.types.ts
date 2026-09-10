// SPDX-License-Identifier: MIT

/**
 * Responsibility:
 * Khai báo type mô tả dữ liệu trả về từ GET /api/v1/health, dùng
 * chung cho api/ và controllers/ ở phía frontend.
 *
 * Does NOT:
 * - validate dữ liệu tại runtime (đây chỉ là type compile-time)
 *
 * Reason:
 * Frontend cần biết trước hình dạng response để dùng an toàn trong
 * TypeScript, thay vì dùng `any` cho kết quả gọi API.
 */
export interface HealthStatus {
  status: "ok";
}

export interface ApiError {
  code: string;
  message: string;
}

export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: ApiError };
