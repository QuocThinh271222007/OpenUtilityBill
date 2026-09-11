// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { loadDatabaseConfig } from "../database.config";

test("loadDatabaseConfig: DATABASE_URL hợp lệ -> PASS", () => {
  const result = loadDatabaseConfig({ DATABASE_URL: "postgres://user:pass@host:5432/db" } as NodeJS.ProcessEnv);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.connectionString, "postgres://user:pass@host:5432/db");
  }
});

test("loadDatabaseConfig: cắt khoảng trắng thừa", () => {
  const result = loadDatabaseConfig({ DATABASE_URL: "  postgres://user:pass@host:5432/db  " } as NodeJS.ProcessEnv);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.connectionString, "postgres://user:pass@host:5432/db");
  }
});

test("loadDatabaseConfig: DATABASE_URL thiếu -> FAIL, không throw", () => {
  const result = loadDatabaseConfig({} as NodeJS.ProcessEnv);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "DATABASE_CONFIG_MISSING");
    // Thông điệp lỗi không được lặp lại giá trị DATABASE_URL (không có
    // gì để lặp lại ở đây vì nó thiếu, nhưng vẫn khẳng định message
    // không chứa từ khoá "postgres://" để chắc chắn không có URL thật
    // nào bị echo ra do nhầm lẫn code).
    assert.equal(result.error.message.includes("postgres://"), false);
  }
});

test("loadDatabaseConfig: DATABASE_URL rỗng hoặc chỉ có khoảng trắng -> FAIL", () => {
  const empty = loadDatabaseConfig({ DATABASE_URL: "" } as NodeJS.ProcessEnv);
  assert.equal(empty.success, false);
  if (!empty.success) {
    assert.equal(empty.error.code, "DATABASE_CONFIG_MISSING");
  }

  const whitespace = loadDatabaseConfig({ DATABASE_URL: "   " } as NodeJS.ProcessEnv);
  assert.equal(whitespace.success, false);
  if (!whitespace.success) {
    assert.equal(whitespace.error.code, "DATABASE_CONFIG_MISSING");
  }
});
