// SPDX-License-Identifier: MIT

import { Result, fail } from "../shared/result";
import { getDatabaseClient } from "./postgres-client";
import type { DatabaseExecutor } from "./database.types";

/**
 * Trách nhiệm:
 * Cung cấp MỘT ranh giới transaction rõ ràng mà tầng Service/Orchestrator
 * dùng — "chạy các thao tác ghi Repository này trong MỘT transaction" —
 * mà không cần biết cú pháp `sql.begin()` của Postgres.js. Được dùng
 * qua `InvoiceUnitOfWork`/`ElectricityTariffUnitOfWork` (xem
 * `backend/src/repositories/invoice-unit-of-work.ts`,
 * `electricity-tariff-unit-of-work.ts`).
 *
 * Input: `work` — một hàm nhận `DatabaseExecutor` (chính là transaction
 * context) và trả về `Promise<Result<T>>`.
 *
 * Output: `Result<T>` — kết quả của `work` khi transaction COMMIT thành
 * công; `Result` thất bại khi `work` tự báo lỗi HOẶC khi bản thân
 * transaction thất bại (mất kết nối, vi phạm constraint không được
 * `work` bắt trước, ...).
 *
 * Bất biến quan trọng:
 * MỌI Repository call bên trong `work` PHẢI dùng đúng `DatabaseExecutor`
 * được truyền vào (tham số của `work`), KHÔNG được tự ý gọi
 * `getDatabaseClient()` (client toàn cục) cho một số câu lệnh — làm vậy
 * sẽ khiến những câu lệnh đó chạy NGOÀI transaction, phá vỡ tính
 * atomicity mà hàm này tồn tại để đảm bảo.
 *
 * Không chịu trách nhiệm:
 * - chứa logic nghiệp vụ (ví dụ CreateInvoice). File này CHỈ là CƠ CHẾ
 *   transaction — workflow cụ thể dùng cơ chế này thuộc về tầng
 *   Service (xem `create-invoice.service.ts`,
 *   `electricity-tariff-management.service.ts`).
 * - để mỗi Repository method tự mở transaction riêng của nó.
 * - giữ transaction mở trong lúc làm việc CPU/tính toán nặng. Theo
 *   quy tắc thiết kế (xem docs/DATABASE_ACCESS.md mục "Transaction"),
 *   Calculation Core phải chạy TRƯỚC khi gọi `runInTransaction` —
 *   `work` chỉ nên chứa các lệnh ghi Repository, không chứa phép tính
 *   hoá đơn.
 *
 * Lý do tồn tại:
 * Tách "cơ chế transaction dùng lại được" khỏi "quy trình nghiệp vụ cụ
 * thể nào cần nó" — cho phép test cơ chế rollback độc lập với bất kỳ
 * workflow nghiệp vụ nào (xem `__tests__/transaction.integration.test.ts`).
 */

/**
 * Postgres.js rollback transaction khi callback truyền cho `sql.begin()`
 * throw (hoặc trả về Promise bị reject). `work()` trả về `Result` theo
 * quy ước của dự án — KHÔNG throw khi thất bại — nên khi `work()` trả
 * về `{ success: false }`, hàm này chủ động "dịch" thất bại đó thành
 * một throw nội bộ (TransactionRollbackError) để kích hoạt rollback,
 * rồi bắt lại lỗi đó ở catch bên dưới và trả về đúng Result thất bại
 * gốc — Result<T> vẫn là hợp đồng DUY NHẤT ở ranh giới ngoài của hàm
 * này, `throw` chỉ là chi tiết cài đặt nội bộ để nói chuyện với
 * Postgres.js.
 */
class TransactionRollbackError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "TransactionRollbackError";
  }
}

export async function runInTransaction<T>(
  work: (tx: DatabaseExecutor) => Promise<Result<T>>
): Promise<Result<T>> {
  const sql = getDatabaseClient();

  try {
    return await sql.begin(async (tx) => {
      const result = await work(tx);
      if (!result.success) {
        throw new TransactionRollbackError(result.error.code, result.error.message);
      }
      return result;
    });
  } catch (error) {
    if (error instanceof TransactionRollbackError) {
      return fail(error.code, error.message);
    }
    // Lỗi không mong đợi từ chính Postgres.js/PostgreSQL (mất kết nối,
    // vi phạm constraint mà work() không tự kiểm tra trước, ...).
    // KHÔNG lộ message lỗi PostgreSQL gốc ra ngoài Result — chỉ ghi log
    // nội bộ cho mục đích debug.
    console.error("[runInTransaction] Transaction thất bại, đã rollback:", error);
    return fail("TRANSACTION_FAILED", "Giao dịch database thất bại và đã được rollback.");
  }
}
