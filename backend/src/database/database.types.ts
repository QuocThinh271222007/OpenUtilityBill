// SPDX-License-Identifier: MIT

import type { Sql, TransactionSql } from "postgres";

/**
 * Trách nhiệm:
 * Khai báo type dùng chung giữa `postgres-client.ts`, `transaction.ts`,
 * và mọi Repository implementation — để các nơi đó không phải tự import
 * trực tiếp type của thư viện `postgres` rải rác khắp nơi.
 *
 * Không chịu trách nhiệm: chứa logic — chỉ type alias.
 */

/**
 * "Bất kỳ thứ gì có thể chạy một câu lệnh SQL tham số hoá" — hoặc client
 * Postgres.js toàn cục (`Sql`, ngoài transaction), hoặc một transaction
 * context (`TransactionSql`, bên trong `sql.begin(...)`, xem
 * `transaction.ts`). Cả hai type đều hỗ trợ cùng cú pháp tagged-template
 * `sql\`SELECT ...\``.
 *
 * Repository nhận `DatabaseExecutor` làm tham số CONSTRUCTOR thay vì
 * luôn tự gọi client toàn cục — để CÙNG một Repository chạy được cả
 * trong lẫn ngoài transaction mà không cần viết hai phiên bản, và để
 * không thể "vô tình" dùng client toàn cục cho một nửa các câu lệnh ghi
 * đáng lẽ phải nằm trong cùng một transaction (xem
 * docs/DATABASE_ACCESS.md mục "Transaction").
 */
export type DatabaseExecutor = Sql | TransactionSql;
