// SPDX-License-Identifier: MIT

import { Result } from "../shared/result";
import { InvoiceRepository } from "./invoice.repository";

/**
 * Trách nhiệm:
 * Trừu tượng hoá "chạy các thao tác ghi InvoiceRepository trong MỘT
 * transaction" mà `CreateInvoiceService` (backend/src/modules/invoice/)
 * có thể phụ thuộc vào — KHÔNG cần biết Postgres.js, `DatabaseExecutor`,
 * hay `runInTransaction` tồn tại.
 *
 * Input: `work` — hàm nhận một `InvoiceRepository` (đã được cấu hình để
 * chạy TRONG transaction) và trả `Promise<Result<T>>`.
 *
 * Output: `Result<T>` — kết quả của `work` khi transaction commit thành
 * công; `Result` thất bại khi `work` tự báo lỗi hoặc khi bản thân
 * transaction thất bại.
 *
 * Lý do tồn tại (thay vì Service tự gọi runInTransaction):
 * Nếu `CreateInvoiceService` tự import `runInTransaction`/
 * `DatabaseExecutor`/`PostgresInvoiceRepository` để tự dựng transaction,
 * Service sẽ phụ thuộc trực tiếp vào chi tiết cài đặt persistence
 * (Postgres.js) — vi phạm ranh giới Service/Repository đã khoá của dự
 * án (xem docs/ARCHITECTURE.md). `InvoiceUnitOfWork` là một interface
 * NHỎ, đúng một phương thức, đủ để che giấu chi tiết đó — KHÔNG phải một
 * framework Unit-of-Work tổng quát (không hỗ trợ nhiều repository khác
 * nhau trong cùng work, không hỗ trợ nested transaction, ...) vì
 * CreateInvoice là nhu cầu ghi duy nhất hiện có.
 *
 * Không chịu trách nhiệm:
 * - biết gì về Postgres.js/SQL — implementation cụ thể (Postgres) nằm ở
 *   `postgres/postgres-invoice-unit-of-work.ts`.
 * - cho phép `work` tự chọn executor nào khác ngoài `InvoiceRepository`
 *   được truyền vào — đảm bảo mọi lệnh ghi bên trong `work` chạy CÙNG
 *   một transaction context.
 */
export interface InvoiceUnitOfWork {
  run<T>(work: (invoiceRepository: InvoiceRepository) => Promise<Result<T>>): Promise<Result<T>>;
}
