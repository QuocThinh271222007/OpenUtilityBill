// SPDX-License-Identifier: MIT

import { Result } from "../../shared/result";
import { runInTransaction } from "../../database/transaction";
import { InvoiceUnitOfWork } from "../invoice-unit-of-work";
import { InvoiceRepository } from "../invoice.repository";
import { PostgresInvoiceRepository } from "./postgres-invoice.repository";

/**
 * Responsibility:
 * Implementation Postgres.js của `InvoiceUnitOfWork` — nơi DUY NHẤT nối
 * `runInTransaction` (cơ chế transaction chung, database/transaction.ts)
 * với `PostgresInvoiceRepository` (SQL cụ thể của bảng invoices/
 * invoice_items).
 *
 * Input/Output: xem `../invoice-unit-of-work.ts` — hợp đồng giống hệt,
 * file này CHỈ hiện thực hoá nó bằng Postgres.js.
 *
 * Important invariant:
 * `work` LUÔN nhận một `PostgresInvoiceRepository` mới, được dựng bằng
 * ĐÚNG transaction context (`tx`) mà `runInTransaction` cấp — không
 * phải client toàn cục — nên `createInvoice` và `createInvoiceItems` gọi
 * từ bên trong `work` chắc chắn nằm CHUNG một transaction, đảm bảo
 * atomicity (invoice + toàn bộ invoice_items cùng commit hoặc cùng
 * rollback, xem docs/TRANSACTIONS.md).
 *
 * Does NOT:
 * - chứa business logic (đó là CreateInvoiceService) hay SQL domain (đó
 *   là PostgresInvoiceRepository) — file này CHỈ lắp ráp hai phần đã có
 *   sẵn.
 */
export class PostgresInvoiceUnitOfWork implements InvoiceUnitOfWork {
  async run<T>(work: (invoiceRepository: InvoiceRepository) => Promise<Result<T>>): Promise<Result<T>> {
    return runInTransaction(async (tx) => {
      const invoiceRepository = new PostgresInvoiceRepository(tx);
      return work(invoiceRepository);
    });
  }
}
