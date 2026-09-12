// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Sql } from "postgres";
import app from "../../../app";
import { closeDatabaseClient, getDatabaseClient } from "../../../database/postgres-client";

/**
 * Trách nhiệm:
 * Chứng minh, bằng PostgreSQL THẬT và Express THẬT (không giả lập
 * Request/Response — round-trip HTTP thật qua một server ephemeral), rằng
 * `POST /api/v1/invoices` tạo hoá đơn thành công và `GET /api/v1/invoices`
 * đọc lại ĐÚNG hoá đơn/breakdown vừa tạo.
 *
 * Vì sao dùng một HTTP server ephemeral thật (không supertest):
 * `node:http`/`fetch` đã có sẵn trong Node.js runtime (không phải
 * dependency mới — xem "Lý do tồn tại" bên dưới). `app.listen(0)`
 * cấp một cổng ngẫu nhiên còn trống; `fetch` (built-in từ Node 18+) gọi
 * request HTTP THẬT tới server đó — đây là cách nhẹ nhất để có một
 * round-trip HTTP thật mà không thêm thư viện test mới (`supertest`
 * cố ý không được dùng trong dự án này).
 *
 * Không chịu trách nhiệm:
 * - chạm tới dữ liệu không liên quan — mọi fixture dùng tiền tố tên
 *   DUY NHẤT `VALIDATION_INVOICE_API_*` kèm timestamp, dọn dẹp tường
 *   minh trong `finally`.
 * - claim PASS nếu không có DATABASE_URL — SKIP rõ ràng.
 * - test Controller/Service orchestration chi tiết — điều đó đã được
 *   test bằng fake ở `invoice.controller.test.ts`/
 *   `create-invoice.service.test.ts`/`get-invoice.service.test.ts`. File
 *   này CHỈ chứng minh dây nối HTTP -> Route -> Controller -> Service
 *   thật -> Repository thật -> PostgreSQL thật hoạt động đầu-cuối.
 */
const hasDatabaseUrl = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.trim().length > 0;

interface Fixtures {
  propertyName: string;
  roomName: string;
  electricityTariffName: string;
  waterTariffName: string;
  roomId: string;
}

async function createFixtures(sql: Sql, suffix: string, billingPeriod: string): Promise<Fixtures> {
  const propertyName = `VALIDATION_INVOICE_API_PROPERTY_${suffix}`;
  const roomName = `VALIDATION_INVOICE_API_ROOM_${suffix}`;
  const electricityTariffName = `VALIDATION_INVOICE_API_ELEC_TARIFF_${suffix}`;
  const waterTariffName = `VALIDATION_INVOICE_API_WATER_TARIFF_${suffix}`;

  const [property] = await sql`INSERT INTO rental_properties (name) VALUES (${propertyName}) RETURNING id`;
  const [room] = await sql`
    INSERT INTO rooms (property_id, name, tenant_count) VALUES (${property.id}, ${roomName}, 4) RETURNING id
  `;

  // effective_from/effective_to CỐ Ý bị chặn trong năm 2023 (KHÔNG NULL ở
  // effective_to) — nằm HOÀN TOÀN NGOÀI khoảng hiệu lực của tariff seed
  // thật (điện: 2025-05-10..2026-12-31; nước: 2026-09-06..NULL) VÀ ngoài
  // khoảng 2024 dùng bởi postgres-invoice-unit-of-work.integration.test.ts.
  // Nếu để effective_to = NULL và effective_from trùng/giao với seed
  // thật, một test file khác chạy ĐỒNG THỜI (node:test chạy song song
  // nhiều file) có thể đọc thấy CẢ tariff seed LẪN tariff fixture này
  // cùng có hiệu lực tại cùng một billingPeriod -> Service gọi
  // findApplicableTariffForPeriod nhận AMBIGUOUS_TARIFF_CONFIGURATION giả
  // -> POST /api/v1/invoices trả 422 không ổn định — đây là nguyên nhân
  // THẬT đã phát hiện được khi chạy test này trên PostgreSQL thật.
  const [electricityTariff] = await sql`
    INSERT INTO electricity_tariffs (
      name, effective_from, effective_to, electricity_vat_rate, people_per_quota_unit, fallback_tier_number
    ) VALUES (${electricityTariffName}, '2023-01-01', '2023-12-31', 0.08, 4, 3)
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

  await sql`
    INSERT INTO water_tariffs (
      name, effective_from, effective_to, price_per_cubic_meter, price_per_person, vat_rate, environmental_fee_rate
    ) VALUES (${waterTariffName}, '2023-01-01', '2023-12-31', 8500, 80000, 0.05, 0.10)
  `;

  await sql`
    INSERT INTO meter_readings (room_id, billing_period, utility_type, previous_reading, current_reading)
    VALUES (${room.id}, ${billingPeriod}, 'ELECTRICITY', 0, 120)
  `;
  await sql`
    INSERT INTO meter_readings (room_id, billing_period, utility_type, previous_reading, current_reading)
    VALUES (${room.id}, ${billingPeriod}, 'WATER', 0, 10)
  `;

  return { propertyName, roomName, electricityTariffName, waterTariffName, roomId: room.id };
}

/** invoices xoá TRƯỚC (cascade invoice_items) do FK RESTRICT từ invoices vào các bảng còn lại. */
async function cleanupFixtures(sql: Sql, fixtures: Fixtures): Promise<void> {
  await sql`DELETE FROM invoices WHERE room_id = ${fixtures.roomId}`;
  await sql`DELETE FROM meter_readings WHERE room_id = ${fixtures.roomId}`;
  await sql`DELETE FROM electricity_tariffs WHERE name = ${fixtures.electricityTariffName}`;
  await sql`DELETE FROM water_tariffs WHERE name = ${fixtures.waterTariffName}`;
  await sql`DELETE FROM rooms WHERE name = ${fixtures.roomName}`;
  await sql`DELETE FROM rental_properties WHERE name = ${fixtures.propertyName}`;
}

test(
  "invoice REST API: POST tạo hoá đơn thật qua HTTP, GET đọc lại ĐÚNG hoá đơn/breakdown vừa tạo",
  { skip: hasDatabaseUrl ? false : "Cần DATABASE_URL trỏ tới Supabase PostgreSQL đã chạy migration + seed." },
  async () => {
    const sql = getDatabaseClient();
    // 2023-06-01 CỐ Ý nằm ngoài khoảng hiệu lực của tariff seed thật —
    // xem giải thích ở createFixtures().
    const billingPeriod = "2023-06-01";
    const fixtures = await createFixtures(sql, `${Date.now()}`, billingPeriod);

    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}/api/v1`;

    try {
      const postResponse = await fetch(`${baseUrl}/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: fixtures.roomId,
          billingPeriod,
          electricityBillingMethod: "QUOTA_TIERED",
          waterBillingMethod: "PER_CUBIC_METER",
          actualChargedAmount: "367000.12",
        }),
      });

      assert.equal(postResponse.status, 201);
      const postBody = (await postResponse.json()) as {
        success: boolean;
        data: { invoice: { id: string; billingPeriod: string; calculatedTotal: string }; items: unknown[]; billingDifference: string };
      };
      assert.equal(postBody.success, true);
      assert.equal(postBody.data.invoice.billingPeriod, "2023-06-01");
      assert.equal(postBody.data.invoice.calculatedTotal, "366994.00");
      assert.equal(postBody.data.billingDifference, "6.12");
      assert.equal(postBody.data.items.length, 7);

      const getResponse = await fetch(`${baseUrl}/invoices?roomId=${fixtures.roomId}&billingPeriod=${billingPeriod}`);
      assert.equal(getResponse.status, 200);
      const getBody = (await getResponse.json()) as {
        success: boolean;
        data: { invoice: { id: string }; items: Array<{ displayOrder: number }>; billingDifference: string };
      };
      assert.equal(getBody.success, true);
      assert.equal(getBody.data.invoice.id, postBody.data.invoice.id);
      assert.equal(getBody.data.items.length, 7);
      assert.deepEqual(
        getBody.data.items.map((item) => item.displayOrder),
        [1, 2, 3, 4, 5, 6, 7]
      );
      assert.equal(getBody.data.billingDifference, "6.12");

      // POST trùng cùng (roomId, billingPeriod) -> 409, không tạo thêm invoice thứ hai.
      const duplicateResponse = await fetch(`${baseUrl}/invoices`, {
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
      assert.equal(duplicateResponse.status, 409);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await cleanupFixtures(sql, fixtures);
      await closeDatabaseClient();
    }
  }
);
