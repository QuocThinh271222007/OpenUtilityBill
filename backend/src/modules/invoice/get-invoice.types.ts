// SPDX-License-Identifier: MIT

import { Invoice, InvoiceItem } from "./invoice.model";
import { InvoiceRepository } from "../../repositories/invoice.repository";

/**
 * Responsibility:
 * Khai báo type dùng chung của `GetInvoiceService` — input, output, và
 * dependency — tách khỏi `get-invoice.service.ts` cùng lý do với
 * `create-invoice.types.ts`.
 *
 * Does NOT: chứa logic — chỉ type/interface.
 */
export interface GetInvoiceInput {
  roomId: string;
  billingPeriod: Date;
}

/**
 * `billingDifference` được TÍNH LẠI on-demand từ hai giá trị đã lưu
 * (`invoice.calculatedTotal`, `invoice.actualChargedAmount`) — KHÔNG
 * tính lại điện/nước. Xem `get-invoice.service.ts` "Does NOT".
 */
export interface GetInvoiceResult {
  invoice: Invoice;
  items: InvoiceItem[];
  billingDifference: string | null;
}

export interface GetInvoiceDependencies {
  invoiceRepository: InvoiceRepository;
}
