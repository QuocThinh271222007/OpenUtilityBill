// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../shared/result";
import { Invoice, InvoiceItem } from "./invoice.model";
import { CreateInvoiceResult } from "./create-invoice.types";
import { GetInvoiceResult } from "./get-invoice.types";

/**
 * Responsibility:
 * Tiện ích ranh giới HTTP CHỈ cho module invoice — parse `billingPeriod`
 * dạng "YYYY-MM-DD" từ request, chuyển domain object (Invoice/
 * InvoiceItem/CreateInvoiceResult/GetInvoiceResult) thành JSON an toàn
 * cho response, và ánh xạ error code (Result) -> HTTP status. Tách khỏi
 * `invoice.controller.ts` để Controller chỉ còn điều phối (gọi Service,
 * gọi các hàm thuần tuý ở đây, ghi response).
 *
 * Does NOT:
 * - import Express `Request`/`Response` — mọi hàm ở đây nhận/trả dữ
 *   liệu thuần tuý, không phụ thuộc trực tiếp framework HTTP, dễ test
 *   độc lập.
 * - chứa business logic (không gọi Repository/Calculation Core).
 */

const WIRE_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * "YYYY-MM-DD" -> UTC-midnight `Date`, khớp hợp đồng hiện có của
 * CreateInvoiceService/GetInvoiceService (`billingPeriod: Date`).
 *
 * Failure conditions (đều trả `VALIDATION_ERROR`):
 * - `value` không phải string.
 * - không đúng hình dạng `YYYY-MM-DD` (ví dụ "2026-9-1", hoặc có phần
 *   giờ/múi giờ như "2026-09-01T10:00:00Z" — API KHÔNG chấp nhận
 *   timestamp JS tuỳ ý, chỉ đúng hình dạng ngày).
 * - không phải một ngày lịch có thật (ví dụ "2026-02-30" — `Date.UTC`
 *   sẽ tự "tràn" sang ngày khác thay vì tự báo lỗi, nên phải so khớp
 *   lại year/month/day sau khi dựng `Date` để bắt trường hợp này).
 * - `day != 1` — billingPeriod luôn là ngày đầu tháng, cùng ràng buộc
 *   với migration 001 `CHECK (EXTRACT(DAY FROM billing_period) = 1)`.
 *
 * Why UTC, not local time:
 * `Date.UTC(...)` loại bỏ hoàn toàn phụ thuộc múi giờ máy chủ ở ranh
 * giới HTTP — xem docs/DATABASE_ACCESS.md mục "DATE boundary — reviewed,
 * not changed" (task này KHÔNG đổi toàn bộ ranh giới DATE của dự án,
 * chỉ đảm bảo điểm vào HTTP mới xây dựng chính xác).
 */
export function parseBillingPeriodWireFormat(value: unknown): Result<Date> {
  if (typeof value !== "string") {
    return fail("VALIDATION_ERROR", "billingPeriod là bắt buộc và phải là chuỗi dạng YYYY-MM-DD.");
  }

  const match = WIRE_DATE_PATTERN.exec(value);
  if (!match) {
    return fail("VALIDATION_ERROR", `billingPeriod không đúng định dạng YYYY-MM-DD: "${value}".`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return fail("VALIDATION_ERROR", `billingPeriod không phải một ngày lịch hợp lệ: "${value}".`);
  }
  if (day !== 1) {
    return fail("VALIDATION_ERROR", `billingPeriod phải là ngày đầu tiên của tháng (day = 01): "${value}".`);
  }

  return ok(date);
}

/**
 * `Date` (giả định UTC-midnight, đúng quy ước billingPeriod) ->
 * "YYYY-MM-DD". An toàn cho cả Date do Controller tự dựng (từ
 * `parseBillingPeriodWireFormat`) LẪN Date do Postgres.js trả về khi
 * đọc cột DATE — Postgres.js parse giá trị DATE bằng `new Date(x)` trên
 * chuỗi "YYYY-MM-DD" thô từ PostgreSQL, và `new Date("YYYY-MM-DD")` (không
 * có phần giờ) luôn được JS hiểu là UTC-midnight theo đặc tả ISO 8601 —
 * xem `node_modules/postgres/src/types.js` (`date.parse`).
 */
export function formatDateAsWireDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Ánh xạ error code (Result) -> HTTP status. KHÔNG phải một framework
 * SQLSTATE/error tổng quát — chỉ đúng danh sách mã lỗi THỰC SỰ có thể
 * phát sinh từ CreateInvoiceService/GetInvoiceService (Repository +
 * Calculation Core mà hai Service đó gọi tới). Mã lỗi không nằm trong
 * bảng (không mong đợi xảy ra qua hai endpoint này) -> 500, KHÔNG đoán
 * một mã 4xx cho một tình huống chưa biết.
 */
const STATUS_BY_ERROR_CODE: Readonly<Record<string, number>> = {
  VALIDATION_ERROR: 400,
  INVALID_ACTUAL_CHARGED_AMOUNT: 400,

  ROOM_NOT_FOUND: 404,
  METER_READING_NOT_FOUND: 404,
  TARIFF_NOT_FOUND: 404,
  INVOICE_NOT_FOUND: 404,

  INVOICE_ALREADY_EXISTS: 409,

  AMBIGUOUS_TARIFF_CONFIGURATION: 422,
  TARIFF_CONFIGURATION_INVALID: 422,
  INVALID_QUOTA: 422,
  INVALID_TENANT_COUNT: 422,
  INVALID_METER_READING: 422,
  INVALID_METER_MAXIMUM: 422,
  METER_MAXIMUM_REQUIRED: 422,
  FALLBACK_TIER_NOT_FOUND: 422,
  INVALID_WATER_METHOD: 422,
  INVALID_WATER_RATE: 422,
  INVALID_VAT_RATE: 422,
  INVALID_DECIMAL: 422,

  DATABASE_READ_FAILED: 500,
  DATABASE_WRITE_FAILED: 500,
  TRANSACTION_FAILED: 500,
  INTERNAL_INVARIANT_VIOLATION: 500,
};

export function mapResultErrorCodeToHttpStatus(code: string): number {
  return STATUS_BY_ERROR_CODE[code] ?? 500;
}

/**
 * `Invoice` (domain — `billingPeriod`/`createdAt` là `Date`) -> JSON-safe:
 * `billingPeriod` thành "YYYY-MM-DD", `createdAt` thành timestamp
 * ISO-8601 đầy đủ. Mọi field khác (id, các `...Id`, số tiền) vốn đã là
 * `string` — giữ nguyên, KHÔNG canonicalize (xem
 * docs/DATABASE_ACCESS.md mục "NUMERIC string format is not
 * canonicalized").
 */
export function serializeInvoice(invoice: Invoice) {
  return {
    id: invoice.id,
    roomId: invoice.roomId,
    billingPeriod: formatDateAsWireDate(invoice.billingPeriod),
    tenantCountUsed: invoice.tenantCountUsed,
    electricityTariffId: invoice.electricityTariffId,
    waterTariffId: invoice.waterTariffId,
    electricityBillingMethod: invoice.electricityBillingMethod,
    waterBillingMethod: invoice.waterBillingMethod,
    electricityReadingId: invoice.electricityReadingId,
    waterReadingId: invoice.waterReadingId,
    calculatedTotal: invoice.calculatedTotal,
    actualChargedAmount: invoice.actualChargedAmount,
    createdAt: invoice.createdAt.toISOString(),
  };
}

/** `InvoiceItem` đã JSON-safe (không có `Date`/`bigint`) — liệt kê tường minh từng field, không dùng spread ẩn hình dạng. */
export function serializeInvoiceItem(item: InvoiceItem) {
  return {
    id: item.id,
    invoiceId: item.invoiceId,
    category: item.category,
    tierNumber: item.tierNumber,
    quantity: item.quantity,
    unitName: item.unitName,
    unitPrice: item.unitPrice,
    amount: item.amount,
    description: item.description,
    displayOrder: item.displayOrder,
  };
}

/**
 * `electricity.result`/`water`/`invoiceTotal` (Calculation Core) đã
 * JSON-safe theo hợp đồng của chính Calculation Core (chỉ `string`/
 * `number`, không `Date`/`bigint` — xem
 * backend/src/calculation/__tests__/public-json-safety.test.ts) nên
 * được giữ nguyên, không cần hàm serialize riêng.
 */
export function serializeCreateInvoiceResult(result: CreateInvoiceResult) {
  return {
    invoice: serializeInvoice(result.invoice),
    items: result.items.map(serializeInvoiceItem),
    electricity: result.electricity,
    water: result.water,
    invoiceTotal: result.invoiceTotal,
    billingDifference: result.billingDifference,
  };
}

export function serializeGetInvoiceResult(result: GetInvoiceResult) {
  return {
    invoice: serializeInvoice(result.invoice),
    items: result.items.map(serializeInvoiceItem),
    billingDifference: result.billingDifference,
  };
}
