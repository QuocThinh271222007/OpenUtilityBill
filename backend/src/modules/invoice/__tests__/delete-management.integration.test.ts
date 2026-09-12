// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Sql } from "postgres";
import app from "../../../app";
import { closeDatabaseClient, getDatabaseClient } from "../../../database/postgres-client";

/**
 * Trách nhiệm:
 * Chứng minh, bằng PostgreSQL THẬT và Express THẬT (cùng cách tiếp cận
 * với `invoice.api.integration.test.ts` — không supertest, dùng
 * `app.listen(0)` + `fetch` built-in), rằng các endpoint
 * `DELETE /api/v1/*` MỚI (SAFE DELETE / CRUD COMPLETION R1) tôn trọng
 * ĐÚNG các ràng buộc FK đã có sẵn ở migration 001:
 * - `ON DELETE RESTRICT` (rooms.property_id, meter_readings.room_id,
 *   invoices.room_id/electricity_tariff_id/water_tariff_id/
 *   electricity_reading_id/water_reading_id) -> DELETE bị PostgreSQL
 *   CHẶN THẬT SỰ, Repository dịch đúng sang domain error 409.
 * - `ON DELETE CASCADE` (invoice_items.invoice_id) -> xoá invoice cha
 *   khiến invoice_items tự biến mất, KHÔNG cần xoá thủ công.
 *
 * SKIP (không fail) khi không có DATABASE_URL — cùng quy ước với
 * `invoice.api.integration.test.ts`.
 *
 * Không chịu trách nhiệm:
 * - chạm tới dữ liệu không liên quan — mọi fixture dùng tiền tố tên
 *   DUY NHẤT `VALIDATION_DELETE_MGMT_*` kèm timestamp, dọn dẹp tường
 *   minh trong `finally` (kể cả khi assertion giữa chừng throw).
 * - test lại toàn bộ HTTP contract (400/500/...) — đã test đầy đủ bằng
 *   fake ở `*.controller.test.ts` của từng module. File này CHỈ chứng
 *   minh dây nối HTTP -> Route -> Controller -> Service -> Repository
 *   thật -> PostgreSQL thật cho ĐÚNG các ca RESTRICT/CASCADE trên.
 */
const hasDatabaseUrl = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.trim().length > 0;

interface Fixtures {
  propertyId: string;
  propertyName: string;
  roomId: string;
  roomName: string;
  electricityTariffId: string;
  electricityTariffName: string;
  waterTariffId: string;
  waterTariffName: string;
  electricityReadingId: string;
  waterReadingId: string;
}

async function createFixtures(sql: Sql, suffix: string, billingPeriod: string): Promise<Fixtures> {
  const propertyName = `VALIDATION_DELETE_MGMT_PROPERTY_${suffix}`;
  const roomName = `VALIDATION_DELETE_MGMT_ROOM_${suffix}`;
  const electricityTariffName = `VALIDATION_DELETE_MGMT_ELEC_TARIFF_${suffix}`;
  const waterTariffName = `VALIDATION_DELETE_MGMT_WATER_TARIFF_${suffix}`;

  const [property] = await sql`INSERT INTO rental_properties (name) VALUES (${propertyName}) RETURNING id`;
  const [room] = await sql`
    INSERT INTO rooms (property_id, name, tenant_count) VALUES (${property.id}, ${roomName}, 4) RETURNING id
  `;

  // Khoảng hiệu lực 2022 CỐ Ý cách ly khỏi seed thật và các integration
  // test khác chạy song song — cùng lý do với invoice.api.integration.test.ts.
  const [electricityTariff] = await sql`
    INSERT INTO electricity_tariffs (
      name, effective_from, effective_to, electricity_vat_rate, people_per_quota_unit, fallback_tier_number
    ) VALUES (${electricityTariffName}, '2022-01-01', '2022-12-31', 0.08, 4, 3)
    RETURNING id
  `;
  await sql`
    INSERT INTO electricity_tariff_tiers (tariff_id, tier_number, threshold_kwh, unit_price)
    VALUES
      (${electricityTariff.id}, 1, 50, 1984),
      (${electricityTariff.id}, 2, 50, 2050),
      (${electricityTariff.id}, 3, 100, 2380),
      (${electricityTariff.id}, 4, 100, 2998),
      (${electricityTariff.id}, 5, 100, 3350),
      (${electricityTariff.id}, 6, NULL, 3460)
  `;

  const [waterTariff] = await sql`
    INSERT INTO water_tariffs (
      name, effective_from, effective_to, price_per_cubic_meter, price_per_person, vat_rate, environmental_fee_rate
    ) VALUES (${waterTariffName}, '2022-01-01', '2022-12-31', 8500, 80000, 0.05, 0.10)
    RETURNING id
  `;

  const [electricityReading] = await sql`
    INSERT INTO meter_readings (room_id, billing_period, utility_type, previous_reading, current_reading)
    VALUES (${room.id}, ${billingPeriod}, 'ELECTRICITY', 0, 120)
    RETURNING id
  `;
  const [waterReading] = await sql`
    INSERT INTO meter_readings (room_id, billing_period, utility_type, previous_reading, current_reading)
    VALUES (${room.id}, ${billingPeriod}, 'WATER', 0, 10)
    RETURNING id
  `;

  return {
    propertyId: property.id,
    propertyName,
    roomId: room.id,
    roomName,
    electricityTariffId: electricityTariff.id,
    electricityTariffName,
    waterTariffId: waterTariff.id,
    waterTariffName,
    electricityReadingId: electricityReading.id,
    waterReadingId: waterReading.id,
  };
}

/** invoices xoá TRƯỚC (nếu còn sót) do FK RESTRICT từ invoices vào các bảng còn lại. */
async function cleanupFixtures(sql: Sql, fixtures: Fixtures): Promise<void> {
  await sql`DELETE FROM invoices WHERE room_id = ${fixtures.roomId}`;
  await sql`DELETE FROM meter_readings WHERE room_id = ${fixtures.roomId}`;
  await sql`DELETE FROM electricity_tariffs WHERE id = ${fixtures.electricityTariffId}`;
  await sql`DELETE FROM water_tariffs WHERE id = ${fixtures.waterTariffId}`;
  await sql`DELETE FROM rooms WHERE id = ${fixtures.roomId}`;
  await sql`DELETE FROM rental_properties WHERE id = ${fixtures.propertyId}`;
}

test(
  "SAFE DELETE: RESTRICT chặn đúng khi còn phụ thuộc, CASCADE xoá đúng invoice_items khi xoá invoice, dữ liệu KHÁC được bảo toàn",
  { skip: hasDatabaseUrl ? false : "Cần DATABASE_URL trỏ tới Supabase PostgreSQL đã chạy migration + seed." },
  async () => {
    const sql = getDatabaseClient();
    const billingPeriod = "2022-06-01";
    const fixtures = await createFixtures(sql, `${Date.now()}`, billingPeriod);

    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}/api/v1`;
    let invoiceId: string | null = null;

    try {
      // ---- DELETE_PROPERTY_RESTRICT_RUNTIME: property còn room -> 409 ----
      const propertyDeleteBlocked = await fetch(`${baseUrl}/properties/${fixtures.propertyId}`, { method: "DELETE" });
      assert.equal(propertyDeleteBlocked.status, 409);
      const propertyDeleteBlockedBody = (await propertyDeleteBlocked.json()) as { success: boolean; error: { code: string } };
      assert.equal(propertyDeleteBlockedBody.success, false);
      assert.equal(propertyDeleteBlockedBody.error.code, "PROPERTY_HAS_DEPENDENCIES");

      // ---- DELETE_ROOM_RESTRICT_RUNTIME: room còn meter reading -> 409 ----
      const roomDeleteBlocked = await fetch(`${baseUrl}/rooms/${fixtures.roomId}`, { method: "DELETE" });
      assert.equal(roomDeleteBlocked.status, 409);
      const roomDeleteBlockedBody = (await roomDeleteBlocked.json()) as { success: boolean; error: { code: string } };
      assert.equal(roomDeleteBlockedBody.success, false);
      assert.equal(roomDeleteBlockedBody.error.code, "ROOM_HAS_DEPENDENCIES");

      // Tạo invoice THẬT tham chiếu room/tariffs/readings ở trên, để chứng
      // minh RESTRICT trên các quan hệ còn lại (reading/tariff <- invoice).
      const createInvoiceResponse = await fetch(`${baseUrl}/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: fixtures.roomId,
          billingPeriod,
          electricityBillingMethod: "QUOTA_TIERED",
          waterBillingMethod: "PER_CUBIC_METER",
          actualChargedAmount: null,
        }),
      });
      assert.equal(createInvoiceResponse.status, 201);
      const createInvoiceBody = (await createInvoiceResponse.json()) as { success: boolean; data: { invoice: { id: string } } };
      assert.equal(createInvoiceBody.success, true);
      invoiceId = createInvoiceBody.data.invoice.id;

      // ---- DELETE_READING_RESTRICT_RUNTIME: reading đã được invoice tham chiếu -> 409 ----
      const readingDeleteBlocked = await fetch(`${baseUrl}/meter-readings/${fixtures.electricityReadingId}`, { method: "DELETE" });
      assert.equal(readingDeleteBlocked.status, 409);
      const readingDeleteBlockedBody = (await readingDeleteBlocked.json()) as { success: boolean; error: { code: string } };
      assert.equal(readingDeleteBlockedBody.success, false);
      assert.equal(readingDeleteBlockedBody.error.code, "METER_READING_IN_USE");

      // ---- DELETE_TARIFF_RESTRICT_RUNTIME: tariff đã được invoice tham chiếu -> 409 ----
      const electricityTariffDeleteBlocked = await fetch(`${baseUrl}/tariffs/electricity/${fixtures.electricityTariffId}`, { method: "DELETE" });
      assert.equal(electricityTariffDeleteBlocked.status, 409);
      const electricityTariffDeleteBlockedBody = (await electricityTariffDeleteBlocked.json()) as { success: boolean; error: { code: string } };
      assert.equal(electricityTariffDeleteBlockedBody.success, false);
      assert.equal(electricityTariffDeleteBlockedBody.error.code, "TARIFF_IN_USE");

      const waterTariffDeleteBlocked = await fetch(`${baseUrl}/tariffs/water/${fixtures.waterTariffId}`, { method: "DELETE" });
      assert.equal(waterTariffDeleteBlocked.status, 409);
      const waterTariffDeleteBlockedBody = (await waterTariffDeleteBlocked.json()) as { success: boolean; error: { code: string } };
      assert.equal(waterTariffDeleteBlockedBody.success, false);
      assert.equal(waterTariffDeleteBlockedBody.error.code, "TARIFF_IN_USE");

      // ---- DELETE_INVOICE_ITEM_CASCADE_RUNTIME: xoá invoice -> thành công, invoice_items tự biến mất ----
      const [{ count: itemCountBeforeDelete }] = await sql<Array<{ count: string }>>`
        SELECT COUNT(*)::int AS count FROM invoice_items WHERE invoice_id = ${invoiceId}
      `;
      assert.ok(Number(itemCountBeforeDelete) > 0, "invoice phải có ít nhất một invoice_item trước khi xoá");

      const deleteInvoiceResponse = await fetch(`${baseUrl}/invoices/${invoiceId}`, { method: "DELETE" });
      assert.equal(deleteInvoiceResponse.status, 200);
      const deleteInvoiceBody = (await deleteInvoiceResponse.json()) as { success: boolean; data: { id: string } };
      assert.equal(deleteInvoiceBody.success, true);
      assert.equal(deleteInvoiceBody.data.id, invoiceId);

      const [{ count: itemCountAfterDelete }] = await sql<Array<{ count: string }>>`
        SELECT COUNT(*)::int AS count FROM invoice_items WHERE invoice_id = ${invoiceId}
      `;
      assert.equal(Number(itemCountAfterDelete), 0, "invoice_items phải tự biến mất qua ON DELETE CASCADE");
      invoiceId = null; // đã xoá — finally không cần dọn lại.

      // room/meter_readings/tariffs KHÔNG bị đụng tới khi xoá invoice.
      const [{ count: roomCountAfterDelete }] = await sql<Array<{ count: string }>>`
        SELECT COUNT(*)::int AS count FROM rooms WHERE id = ${fixtures.roomId}
      `;
      assert.equal(Number(roomCountAfterDelete), 1, "room phải còn nguyên sau khi xoá invoice");
      const [{ count: readingCountAfterDelete }] = await sql<Array<{ count: string }>>`
        SELECT COUNT(*)::int AS count FROM meter_readings WHERE room_id = ${fixtures.roomId}
      `;
      assert.equal(Number(readingCountAfterDelete), 2, "cả hai meter reading phải còn nguyên sau khi xoá invoice");
      const [{ count: elecTariffCountAfterDelete }] = await sql<Array<{ count: string }>>`
        SELECT COUNT(*)::int AS count FROM electricity_tariffs WHERE id = ${fixtures.electricityTariffId}
      `;
      assert.equal(Number(elecTariffCountAfterDelete), 1, "electricity tariff phải còn nguyên sau khi xoá invoice");
      const [{ count: waterTariffCountAfterDelete }] = await sql<Array<{ count: string }>>`
        SELECT COUNT(*)::int AS count FROM water_tariffs WHERE id = ${fixtures.waterTariffId}
      `;
      assert.equal(Number(waterTariffCountAfterDelete), 1, "water tariff phải còn nguyên sau khi xoá invoice");

      // Sau khi invoice biến mất, mọi RESTRICT ở trên PHẢI tự động cho phép xoá.
      const readingDeleteAllowed = await fetch(`${baseUrl}/meter-readings/${fixtures.electricityReadingId}`, { method: "DELETE" });
      assert.equal(readingDeleteAllowed.status, 200);
      // waterReadingId KHÔNG được kiểm tra RESTRICT ở trên (chỉ electricityReadingId) —
      // nhưng room vẫn tham chiếu nó nên phải xoá nốt trước khi xoá room.
      const waterReadingDeleteAllowed = await fetch(`${baseUrl}/meter-readings/${fixtures.waterReadingId}`, { method: "DELETE" });
      assert.equal(waterReadingDeleteAllowed.status, 200);

      const electricityTariffDeleteAllowed = await fetch(`${baseUrl}/tariffs/electricity/${fixtures.electricityTariffId}`, { method: "DELETE" });
      assert.equal(electricityTariffDeleteAllowed.status, 200);
      // Tier con của electricity tariff phải tự cascade theo schema.
      const [{ count: tierCountAfterDelete }] = await sql<Array<{ count: string }>>`
        SELECT COUNT(*)::int AS count FROM electricity_tariff_tiers WHERE tariff_id = ${fixtures.electricityTariffId}
      `;
      assert.equal(Number(tierCountAfterDelete), 0, "electricity_tariff_tiers phải tự biến mất qua ON DELETE CASCADE");

      const waterTariffDeleteAllowed = await fetch(`${baseUrl}/tariffs/water/${fixtures.waterTariffId}`, { method: "DELETE" });
      assert.equal(waterTariffDeleteAllowed.status, 200);

      const roomDeleteAllowed = await fetch(`${baseUrl}/rooms/${fixtures.roomId}`, { method: "DELETE" });
      assert.equal(roomDeleteAllowed.status, 200);

      const propertyDeleteAllowed = await fetch(`${baseUrl}/properties/${fixtures.propertyId}`, { method: "DELETE" });
      assert.equal(propertyDeleteAllowed.status, 200);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (invoiceId !== null) {
        await sql`DELETE FROM invoices WHERE id = ${invoiceId}`;
      }
      await cleanupFixtures(sql, fixtures);
      await closeDatabaseClient();
    }
  }
);
