// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { runInTransaction } from "../transaction";
import { closeDatabaseClient, getDatabaseClient } from "../postgres-client";
import { fail } from "../../shared/result";

/**
 * Responsibility:
 * Chứng minh, bằng PostgreSQL THẬT, rằng `runInTransaction`:
 *   1. insert dữ liệu tạm bên trong transaction;
 *   2. một bước sau đó cố ý thất bại (`work()` trả về Result thất bại);
 *   3. transaction ROLLBACK — dữ liệu vừa insert biến mất;
 *   4. không còn dữ liệu thử nghiệm nào sót lại.
 *
 * Cũng kiểm chứng nhánh ngược lại: khi `work()` thành công, transaction
 * COMMIT thật sự (dữ liệu tồn tại sau khi hàm trả về) — để phân biệt rõ
 * hai nhánh, không chỉ test riêng rollback.
 *
 * Does NOT:
 * - chạm tới dữ liệu không liên quan. Mọi hàng test dùng tiền tố tên
 *   DUY NHẤT `VALIDATION_REPOSITORY_TX_` kèm timestamp, dọn dẹp tường
 *   minh trong `finally` kể cả khi assertion thất bại giữa chừng.
 * - claim PASS nếu không có DATABASE_URL — SKIP rõ ràng thay vì giả vờ.
 */
const hasDatabaseUrl = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.trim().length > 0;

test(
  "runInTransaction: rollback khi work() thất bại — không để lại dữ liệu",
  { skip: hasDatabaseUrl ? false : "Cần DATABASE_URL trỏ tới Supabase PostgreSQL thật để chạy test này." },
  async () => {
    const sql = getDatabaseClient();
    const propertyName = `VALIDATION_REPOSITORY_TX_ROLLBACK_${Date.now()}`;

    try {
      const before = await sql`SELECT COUNT(*)::text AS count FROM rental_properties WHERE name = ${propertyName}`;
      assert.equal(before[0].count, "0");

      const result = await runInTransaction(async (tx) => {
        await tx`INSERT INTO rental_properties (name) VALUES (${propertyName})`;
        // Cố ý thất bại SAU khi đã insert — chứng minh rollback hoàn
        // tác cả câu insert đã chạy TRONG transaction này, không chỉ
        // ngăn các câu lệnh chưa chạy.
        return fail("TEST_INTENTIONAL_ROLLBACK", "Lỗi cố ý để kiểm chứng rollback.");
      });

      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error.code, "TEST_INTENTIONAL_ROLLBACK");
      }

      const after = await sql`SELECT COUNT(*)::text AS count FROM rental_properties WHERE name = ${propertyName}`;
      assert.equal(after[0].count, "0", "Không được còn dữ liệu sau rollback");
    } finally {
      await sql`DELETE FROM rental_properties WHERE name = ${propertyName}`;
    }
  }
);

test(
  "runInTransaction: commit khi work() thành công — dữ liệu tồn tại sau khi hàm trả về",
  { skip: hasDatabaseUrl ? false : "Cần DATABASE_URL trỏ tới Supabase PostgreSQL thật để chạy test này." },
  async () => {
    const sql = getDatabaseClient();
    const propertyName = `VALIDATION_REPOSITORY_TX_COMMIT_${Date.now()}`;

    try {
      const result = await runInTransaction(async (tx) => {
        await tx`INSERT INTO rental_properties (name) VALUES (${propertyName})`;
        return { success: true as const, data: null };
      });

      assert.equal(result.success, true);

      const after = await sql`SELECT COUNT(*)::text AS count FROM rental_properties WHERE name = ${propertyName}`;
      assert.equal(after[0].count, "1", "Dữ liệu phải tồn tại sau COMMIT");
    } finally {
      await sql`DELETE FROM rental_properties WHERE name = ${propertyName}`;
      await closeDatabaseClient();
    }
  }
);
