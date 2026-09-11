// SPDX-License-Identifier: MIT

import { Result } from "../../shared/result";
import { formatDateAsWireDate, parseFirstOfMonthWireFormat } from "../../shared/http/date-wire-format";
import { Invoice, InvoiceItem } from "./invoice.model";
import { CreateInvoiceResult } from "./create-invoice.types";
import { GetInvoiceResult } from "./get-invoice.types";

/**
 * Trách nhiệm:
 * Tiện ích ranh giới HTTP CHỈ cho module invoice — parse `billingPeriod`
 * dạng "YYYY-MM-DD" từ request và chuyển domain object (Invoice/
 * InvoiceItem/CreateInvoiceResult/GetInvoiceResult) thành JSON an toàn
 * cho response. Tách khỏi `invoice.controller.ts` để Controller chỉ còn
 * điều phối (gọi Service, gọi các hàm thuần tuý ở đây, ghi response).
 *
 * Việc parse ngày và ánh xạ error code -> HTTP status dùng CHUNG với
 * mọi module khác (property/room/meter-reading/tariff) nay sống ở
 * `backend/src/shared/http/` — file này chỉ RE-EXPORT
 * `mapResultErrorCodeToHttpStatus`/`formatDateAsWireDate` để code hiện
 * tại import từ đây (`./invoice.http`) không cần sửa, và định nghĩa lại
 * `parseBillingPeriodWireFormat` như một wrapper mỏng quanh
 * `parseFirstOfMonthWireFormat` (giữ NGUYÊN tên/hành vi cũ).
 *
 * Không chịu trách nhiệm:
 * - import Express `Request`/`Response` — mọi hàm ở đây nhận/trả dữ
 *   liệu thuần tuý, không phụ thuộc trực tiếp framework HTTP, dễ test
 *   độc lập.
 * - chứa business logic (không gọi Repository/Calculation Core).
 */
export { formatDateAsWireDate } from "../../shared/http/date-wire-format";
export { mapResultErrorCodeToHttpStatus } from "../../shared/http/result-error-status";

/** billingPeriod luôn là ngày đầu tháng — xem `parseFirstOfMonthWireFormat` (shared/http/date-wire-format.ts) cho lý do/hành vi đầy đủ. */
export function parseBillingPeriodWireFormat(value: unknown): Result<Date> {
  return parseFirstOfMonthWireFormat(value);
}

/**
 * `Invoice` (domain — `billingPeriod`/`createdAt` là `Date`) -> JSON-safe:
 * `billingPeriod` thành "YYYY-MM-DD", `createdAt` thành timestamp
 * ISO-8601 đầy đủ. Mọi field khác (id, các `...Id`, số tiền) vốn đã là
 * `string` — giữ nguyên, KHÔNG canonicalize (xem
 * docs/DATABASE_ACCESS.md mục "Định dạng chuỗi NUMERIC không được
 * chuẩn hoá").
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
