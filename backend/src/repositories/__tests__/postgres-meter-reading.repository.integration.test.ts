// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import { closeDatabaseClient, getDatabaseClient } from "../../database/postgres-client";
import { PostgresMeterReadingRepository } from "../postgres/postgres-meter-reading.repository";

/**
 * Chứng minh, bằng PostgreSQL THẬT: create -> update -> list (đúng thứ
 * tự `billing_period DESC, utility_type ASC, id ASC`), và UNIQUE(room_id,
 * billing_period, utility_type) THẬT -> METER_READING_ALREADY_EXISTS.
 *
 * Does NOT:
 * - dựng fixture invoice đầy đủ để chứng minh `isReferencedByInvoice`
 *   trên dữ liệu thật — câu SQL đó đơn giản và đã được unit-test với
 *   executor giả (xem postgres-meter-reading.repository.test.ts); luồng
 *   METER_READING_IN_USE (Service orchestration) đã được chứng minh ở
 *   `meter-reading-management.service.test.ts`. Đây là quyết định phạm
 *   vi có chủ đích dưới áp lực thời hạn (xem docs/MANAGEMENT_API.md).
 */
const hasDatabaseUrl = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.trim().length > 0;

test(
  "PostgresMeterReadingRepository: create -> update -> list đúng thứ tự, và UNIQUE THẬT -> METER_READING_ALREADY_EXISTS",
  { skip: hasDatabaseUrl ? false : "Cần DATABASE_URL trỏ tới Supabase PostgreSQL thật để chạy test này." },
  async () => {
    const sql = getDatabaseClient();
    const repository = new PostgresMeterReadingRepository(sql);
    const propertyName = `VALIDATION_MANAGEMENT_METER_PROPERTY_${Date.now()}`;
    let propertyId: string | null = null;
    let roomId: string | null = null;
    const readingIds: string[] = [];

    try {
      const [property] = await sql`INSERT INTO rental_properties (name) VALUES (${propertyName}) RETURNING id`;
      propertyId = property.id;
      const [room] = await sql`INSERT INTO rooms (property_id, name, tenant_count) VALUES (${propertyId}, 'R1', 2) RETURNING id`;
      roomId = room.id;

      const augResult = await repository.create({
        roomId: roomId as string,
        billingPeriod: new Date("2026-08-01"),
        utilityType: "ELECTRICITY",
        previousReading: "0",
        currentReading: "100",
        meterMaximumValue: null,
      });
      assert.equal(augResult.success, true);
      if (augResult.success) readingIds.push(augResult.data.id);

      const sepResult = await repository.create({
        roomId: roomId as string,
        billingPeriod: new Date("2026-09-01"),
        utilityType: "ELECTRICITY",
        previousReading: "100",
        currentReading: "220",
        meterMaximumValue: null,
      });
      assert.equal(sepResult.success, true);
      if (sepResult.success) readingIds.push(sepResult.data.id);

      const listResult = await repository.listByRoom(roomId as string);
      assert.equal(listResult.success, true);
      if (listResult.success) {
        assert.equal(listResult.data.length, 2);
        // billing_period DESC -> tháng 09 phải đứng TRƯỚC tháng 08.
        assert.equal(listResult.data[0].billingPeriod.toISOString().slice(0, 10), "2026-09-01");
        assert.equal(listResult.data[1].billingPeriod.toISOString().slice(0, 10), "2026-08-01");
      }

      if (augResult.success) {
        const updateResult = await repository.update(augResult.data.id, {
          roomId: roomId as string,
          billingPeriod: new Date("2026-08-01"),
          utilityType: "ELECTRICITY",
          previousReading: "0",
          currentReading: "105",
          meterMaximumValue: null,
        });
        assert.equal(updateResult.success, true);
        // current_reading là NUMERIC(12, 2) -> PostgreSQL trả đủ 2 chữ số
        // thập phân theo scale đã khai báo ("105.00"), không phải "105"
        // (xem giải thích scale ở repository-reads.integration.test.ts).
        if (updateResult.success) assert.equal(updateResult.data.currentReading, "105.00");
      }

      const duplicateResult = await repository.create({
        roomId: roomId as string,
        billingPeriod: new Date("2026-09-01"),
        utilityType: "ELECTRICITY",
        previousReading: "0",
        currentReading: "1",
        meterMaximumValue: null,
      });
      assert.equal(duplicateResult.success, false);
      if (!duplicateResult.success) assert.equal(duplicateResult.error.code, "METER_READING_ALREADY_EXISTS");
    } finally {
      for (const id of readingIds) {
        await sql`DELETE FROM meter_readings WHERE id = ${id}`;
      }
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
