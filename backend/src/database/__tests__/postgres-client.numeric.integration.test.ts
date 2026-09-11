// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { closeDatabaseClient, getDatabaseClient } from "../postgres-client";

/**
 * Trách nhiệm:
 * Chứng minh, bằng PostgreSQL THẬT, rằng NUMERIC và BIGINT đi qua
 * `getDatabaseClient()` (Postgres.js) mà KHÔNG bị ép về JS `number` —
 * đúng hợp đồng chính xác tuyệt đối của dự án (xem
 * docs/DATABASE_ACCESS.md mục "NUMERIC/BIGINT precision boundary").
 *
 * Không chịu trách nhiệm:
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
 *
 * QUAN TRỌNG — phân biệt hai loại literal NUMERIC khác nhau:
 * `'0.08'::numeric` (không khai báo precision/scale) là một NUMERIC
 * "linh hoạt" — PostgreSQL giữ ĐÚNG số chữ số đã nhập, không thêm số 0.
 * Đây KHÔNG PHẢI cùng một tình huống với đọc một CỘT đã khai báo scale
 * cố định, ví dụ `electricity_tariffs.electricity_vat_rate
 * NUMERIC(5, 4)` — cột đó LUÔN trả đủ 4 chữ số thập phân
 * (`"0.0800"`), vì PostgreSQL đệm số 0 theo scale đã khai báo khi lưu
 * trữ, không phải khi đọc. Test đầu tiên dưới đây (dùng `::numeric`
 * không khai báo scale) chứng minh KHÔNG có sai số dấu phẩy động — vẫn
 * đúng và hữu ích. Test thứ hai dùng `CAST(... AS NUMERIC(p, s))` để mô
 * phỏng ĐÚNG hành vi của một cột có scale cố định như trong schema thật
 * (`database/migrations/001_initial_domain_schema.sql`) — đây là bằng
 * chứng sát với dữ liệu thực tế mà Repository đọc được, xem
 * `backend/src/repositories/__tests__/repository-reads.integration.test.ts`.
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

test(
  "postgres-client: NUMERIC với scale cố định (như cột thật trong schema) giữ đủ số 0 đệm, không mất chính xác",
  { skip: hasDatabaseUrl ? false : "Cần DATABASE_URL trỏ tới Supabase PostgreSQL thật để chạy test này." },
  async () => {
    const sql = getDatabaseClient();
    try {
      const rows = await sql`
        SELECT
          CAST('0.08' AS NUMERIC(6, 4))   AS vat_rate,
          CAST('3460' AS NUMERIC(14, 2))  AS unit_price
      `;

      assert.equal(rows.length, 1);
      const row = rows[0];

      // Giống hệt electricity_tariffs.electricity_vat_rate NUMERIC(5, 4)
      // trong schema thật — PostgreSQL đệm đủ 4 chữ số thập phân.
      assert.equal(typeof row.vat_rate, "string");
      assert.equal(row.vat_rate, "0.0800");

      // Giống hệt electricity_tariff_tiers.unit_price NUMERIC(14, 2).
      assert.equal(typeof row.unit_price, "string");
      assert.equal(row.unit_price, "3460.00");
    } finally {
      await closeDatabaseClient();
    }
  }
);
