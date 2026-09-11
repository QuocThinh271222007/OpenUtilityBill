// SPDX-License-Identifier: MIT

/**
 * Responsibility:
 * Type mô tả hợp đồng chung của MỌI response từ backend REST API —
 * dùng chung bởi toàn bộ frontend, khớp CHÍNH XÁC với
 * `backend/src/shared/result.ts` (`Result<T>`) khi đã đi qua HTTP.
 *
 * Does NOT:
 * - validate dữ liệu tại runtime (chỉ là type compile-time).
 *
 * Important invariant:
 * `success` là discriminant — TypeScript strict mode buộc code phải
 * kiểm tra `result.success` trước khi đọc `result.data`, cùng nguyên
 * tắc `Result<T>` phía backend (xem docs/ERROR_HANDLING.md).
 */
export interface ApiError {
  code: string;
  message: string;
}

export type ApiResult<T> = { success: true; data: T } | { success: false; error: ApiError };
