// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { closeDatabaseClient, getDatabaseClient } from "../postgres-client";

/**
 * Responsibility:
 * Chứng minh, bằng PostgreSQL THẬT, rằng NUMERIC và BIGINT đi qua
 * `getDatabaseClient()` (Postgres.js) mà KHÔNG bị ép về JS `number` —
 * đúng hợp đồng chính xác tuyệt đối của dự án (xem
 * docs/DATABASE_ACCESS.md mục "NUMERIC/BIGINT precision boundary").
 *
 * Does NOT:
 * - cần một database THẬT để repository unit test khác chạy được — chỉ
 *   file NÀY (và các test tích hợp khác trong `__tests__/`) cần
 *   `DATABASE_URL`. Tự động SKIP (không FAIL) khi biến đó không có,
 *   thay vì giả vờ PASS — xem docs/DATABASE_ACCESS.md.
 *
 * Bằng chứng nguồn (không chỉ suy đoán hành vi driver):
 * `node_modules/postgres/src/types.js` chỉ đăng ký parser cho OID
 * 21/23/26/700/701 (int2/int4/oid/float4/float8) dưới nhãn `number` —
 * KHÔNG có OID 1700 (numeric) hay OID 20 (int8/bigint). Khi không có
 * parser đăng ký, `connection.js` trả nguyên văn chuỗi UTF-8 mà
 * PostgreSQL gửi qua wire protocol. README của chính thư viện xác nhận
 * tường minh: "There is currently no guaranteed way to handle numeric /
 * decimal types in native Javascript. These [and similar] types will be
 * returned as a string." Test này xác nhận hành vi đó trên kết nối THẬT,
 * không chỉ tin vào tài liệu.
 */
const hasDatabaseUrl = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.trim().length > 0;

test(
  "postgres-client: NUMERIC (62.5125, 124025.123456, 0.08) và BIGINT tối đa đi qua adapter dưới dạng string, không mất chính xác",
  { skip: hasDatabaseUrl ? false : "Cần DATABASE_URL trỏ tới Supabase PostgreSQL thật để chạy test này." },
  async () => {
    const sql = getDatabaseClient();
    try {
      const rows = await sql`
        SELECT
          '62.5125'::numeric        AS quantity,
          '124025.123456'::numeric  AS amount,
          '0.08'::numeric           AS rate,
          9223372036854775807::bigint AS big_id
      `;

      assert.equal(rows.length, 1);
      const row = rows[0];

      assert.equal(typeof row.quantity, "string");
      assert.equal(row.quantity, "62.5125");

      assert.equal(typeof row.amount, "string");
      assert.equal(row.amount, "124025.123456");

      assert.equal(typeof row.rate, "string");
      assert.equal(row.rate, "0.08");

      // BIGINT tối đa (2^63 - 1) — vượt xa Number.MAX_SAFE_INTEGER
      // (2^53 - 1). Nếu driver ép về `number`, giá trị này sẽ bị sai.
      assert.equal(typeof row.big_id, "string");
      assert.equal(row.big_id, "9223372036854775807");
    } finally {
      await closeDatabaseClient();
    }
  }
);
