// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { closeDatabaseClient, getDatabaseClient } from "../../database/postgres-client";
import { PostgresPropertyRepository } from "../postgres/postgres-property.repository";

/**
 * Trách nhiệm:
 * Chứng minh, bằng PostgreSQL THẬT, chu trình create -> update -> read
 * của `PostgresPropertyRepository`. SKIP (không fail) khi không có
 * DATABASE_URL — xem quy ước chung ở
 * `postgres-invoice-unit-of-work.integration.test.ts`.
 */
const hasDatabaseUrl = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.trim().length > 0;

test(
  "PostgresPropertyRepository: create -> update -> read (listAll/findById) trên PostgreSQL thật",
  { skip: hasDatabaseUrl ? false : "Cần DATABASE_URL trỏ tới Supabase PostgreSQL thật để chạy test này." },
  async () => {
    const sql = getDatabaseClient();
    const repository = new PostgresPropertyRepository(sql);
    const name = `VALIDATION_MANAGEMENT_PROPERTY_${Date.now()}`;
    let propertyId: string | null = null;

    try {
      const createResult = await repository.create({ name, address: "123 Test Street" });
      assert.equal(createResult.success, true);
      if (!createResult.success) return;
      propertyId = createResult.data.id;
      assert.equal(createResult.data.address, "123 Test Street");

      const updateResult = await repository.update(propertyId, { address: null });
      assert.equal(updateResult.success, true);
      if (updateResult.success) assert.equal(updateResult.data.address, null);

      const findResult = await repository.findById(propertyId);
      assert.equal(findResult.success, true);
      if (findResult.success) assert.equal(findResult.data.address, null);

      const listResult = await repository.listAll();
      assert.equal(listResult.success, true);
      if (listResult.success) {
        assert.equal(
          listResult.data.some((p) => p.id === propertyId),
          true
        );
      }
    } finally {
      if (propertyId !== null) {
        await sql`DELETE FROM rental_properties WHERE id = ${propertyId}`;
      }
      await closeDatabaseClient();
    }
  }
);
