// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { closeDatabaseClient, getDatabaseClient } from "../../database/postgres-client";
import { PostgresRoomRepository } from "../postgres/postgres-room.repository";

/**
 * Chứng minh, bằng PostgreSQL THẬT, chu trình create -> update -> list
 * của `PostgresRoomRepository`, bao gồm bằng chứng UNIQUE(property_id,
 * name) THẬT -> ROOM_ALREADY_EXISTS. SKIP khi không có DATABASE_URL.
 */
const hasDatabaseUrl = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.trim().length > 0;

test(
  "PostgresRoomRepository: create -> update -> list, và UNIQUE(property_id, name) THẬT -> ROOM_ALREADY_EXISTS",
  { skip: hasDatabaseUrl ? false : "Cần DATABASE_URL trỏ tới Supabase PostgreSQL thật để chạy test này." },
  async () => {
    const sql = getDatabaseClient();
    const repository = new PostgresRoomRepository(sql);
    const propertyName = `VALIDATION_MANAGEMENT_ROOM_PROPERTY_${Date.now()}`;
    let propertyId: string | null = null;
    let roomId: string | null = null;

    try {
      const [property] = await sql`INSERT INTO rental_properties (name) VALUES (${propertyName}) RETURNING id`;
      propertyId = property.id;

      const createResult = await repository.create({ propertyId: propertyId as string, name: "101", tenantCount: 4 });
      assert.equal(createResult.success, true);
      if (!createResult.success) return;
      roomId = createResult.data.id;

      const updateResult = await repository.update(roomId, { tenantCount: 6 });
      assert.equal(updateResult.success, true);
      if (updateResult.success) assert.equal(updateResult.data.tenantCount, 6);

      const listResult = await repository.listAll(propertyId as string);
      assert.equal(listResult.success, true);
      if (listResult.success) assert.equal(listResult.data.length, 1);

      const duplicateResult = await repository.create({ propertyId: propertyId as string, name: "101", tenantCount: 1 });
      assert.equal(duplicateResult.success, false);
      if (!duplicateResult.success) assert.equal(duplicateResult.error.code, "ROOM_ALREADY_EXISTS");
    } finally {
      if (roomId !== null) {
        await sql`DELETE FROM rooms WHERE id = ${roomId}`;
      }
      if (propertyId !== null) {
        await sql`DELETE FROM rental_properties WHERE id = ${propertyId}`;
      }
      await closeDatabaseClient();
    }
  }
);
