// SPDX-License-Identifier: MIT

/**
 * Responsibility:
 * Ánh xạ error code (`Result` thất bại) -> HTTP status — DÙNG CHUNG bởi
 * mọi module HTTP (invoice, property, room, meter-reading, tariff).
 * Tách khỏi `backend/src/modules/invoice/invoice.http.ts` (nơi bảng này
 * bắt đầu) để không viết lại 4-5 bảng gần giống nhau ở mỗi module.
 *
 * KHÔNG phải một framework SQLSTATE/error tổng quát — chỉ đúng danh
 * sách mã lỗi THỰC SỰ có thể phát sinh từ các Service trong dự án này
 * (Repository + Calculation Core mà các Service đó gọi tới). Mã lỗi
 * không nằm trong bảng (không mong đợi xảy ra qua bất kỳ endpoint nào)
 * -> 500, KHÔNG đoán một mã 4xx cho một tình huống chưa biết.
 *
 * Important invariant:
 * Toàn bộ mã lỗi/status của `invoice.http.ts` (task REST API trước) giữ
 * NGUYÊN giá trị ở đây — bảng này chỉ MỞ RỘNG thêm mã mới cho property/
 * room/meter-reading/tariff, không đổi hành vi cũ.
 *
 * Does NOT: chứa message hay logic khác — chỉ code -> status.
 */
const STATUS_BY_ERROR_CODE: Readonly<Record<string, number>> = {
  // ---- 400: input shape/validation ----
  VALIDATION_ERROR: 400,
  INVALID_ACTUAL_CHARGED_AMOUNT: 400,

  // ---- 404: not found ----
  ROOM_NOT_FOUND: 404,
  METER_READING_NOT_FOUND: 404,
  TARIFF_NOT_FOUND: 404,
  INVOICE_NOT_FOUND: 404,
  PROPERTY_NOT_FOUND: 404,

  // ---- 409: conflict ----
  INVOICE_ALREADY_EXISTS: 409,
  ROOM_ALREADY_EXISTS: 409,
  METER_READING_ALREADY_EXISTS: 409,
  METER_READING_IN_USE: 409,
  TARIFF_ALREADY_EXISTS: 409,
  TARIFF_PERIOD_OVERLAP: 409,
  TARIFF_IN_USE: 409,

  // ---- 422: business/configuration validation (Calculation Core + Service) ----
  AMBIGUOUS_TARIFF_CONFIGURATION: 422,
  TARIFF_CONFIGURATION_INVALID: 422,
  INVALID_QUOTA: 422,
  INVALID_TENANT_COUNT: 422,
  INVALID_PEOPLE_PER_QUOTA_UNIT: 422,
  INVALID_METER_READING: 422,
  INVALID_METER_MAXIMUM: 422,
  METER_MAXIMUM_REQUIRED: 422,
  FALLBACK_TIER_NOT_FOUND: 422,
  INVALID_WATER_METHOD: 422,
  INVALID_WATER_RATE: 422,
  INVALID_VAT_RATE: 422,
  INVALID_DECIMAL: 422,
  // validate-electricity-config.ts (chỉ thực sự phát sinh qua endpoint
  // quản trị tariff — CreateInvoice không nhận cấu hình tier trực tiếp
  // từ HTTP nên trước đây không cần các mã này).
  EMPTY_TARIFF: 422,
  INVALID_TIER_NUMBER: 422,
  DUPLICATE_TIER_NUMBER: 422,
  INVALID_TIER_PRICE: 422,
  INVALID_TIER_THRESHOLD: 422,
  NO_UNLIMITED_TIER: 422,
  MULTIPLE_UNLIMITED_TIERS: 422,
  UNLIMITED_TIER_NOT_LAST: 422,

  // ---- 500: infrastructure failure ----
  DATABASE_READ_FAILED: 500,
  DATABASE_WRITE_FAILED: 500,
  TRANSACTION_FAILED: 500,
  INTERNAL_INVARIANT_VIOLATION: 500,
};

export function mapResultErrorCodeToHttpStatus(code: string): number {
  return STATUS_BY_ERROR_CODE[code] ?? 500;
}
