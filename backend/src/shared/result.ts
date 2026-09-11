// SPDX-License-Identifier: MIT

/**
 * Trách nhiệm:
 * Định nghĩa hợp đồng (contract) chung cho kết quả trả về của mọi
 * business logic trong backend: Service, business module, Repository.
 *
 * Đầu vào:
 * Không áp dụng — đây là type definition và hai hàm dựng kết quả,
 * không phải một luồng xử lý nghiệp vụ.
 *
 * Đầu ra:
 * `Result<T>` mô tả đúng hai khả năng: thành công (success = true,
 * kèm data) hoặc thất bại (success = false, kèm error code + message).
 *
 * Không chịu trách nhiệm:
 * - định nghĩa các error code cụ thể cho từng domain (room, tariff, ...)
 * - implement một class hierarchy phức tạp cho lỗi
 *
 * Lý do:
 * Dự án chủ động tránh dùng `return false` cho lỗi có ý nghĩa, vì
 * `false` không mang theo lý do thất bại. `Result<T>` buộc caller phải
 * kiểm tra `success` trước khi truy cập `data`, giúp lỗi được xử lý
 * tường minh thay vì bị bỏ sót — đây là nền tảng cho fail-fast pipeline
 * được mô tả trong docs/ERROR_HANDLING.md.
 */

export interface ResultError {
  code: string;
  message: string;
}

export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: ResultError };

export function ok<T>(data: T): Result<T> {
  return { success: true, data };
}

export function fail<T = never>(code: string, message: string): Result<T> {
  return { success: false, error: { code, message } };
}
