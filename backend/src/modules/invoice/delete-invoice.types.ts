// SPDX-License-Identifier: MIT

import { InvoiceRepository } from "../../repositories/invoice.repository";

/**
 * Trách nhiệm:
 * Khai báo type dùng chung của `DeleteInvoiceService` — output và
 * dependency — tách khỏi `delete-invoice.service.ts` cùng lý do với
 * `get-invoice.types.ts`. Input là một `invoiceId` đơn (string), không
 * cần một interface riêng.
 *
 * Không chịu trách nhiệm: chứa logic — chỉ type/interface.
 */
export interface DeleteInvoiceDependencies {
  invoiceRepository: InvoiceRepository;
}
