// SPDX-License-Identifier: MIT

import test from "node:test";
import assert from "node:assert/strict";
import type { Sql } from "postgres";
import { closeDatabaseClient, getDatabaseClient } from "../../database/postgres-client";
import { PostgresInvoiceUnitOfWork } from "../postgres/postgres-invoice-unit-of-work";
import type { NewInvoice, NewInvoiceItem } from "../invoice.repository";

/**
 * Responsibility:
 * Chứng minh, bằng PostgreSQL THẬT, rằng `PostgresInvoiceUnitOfWork` +
 * `PostgresInvoiceRepository` ghi invoice/invoice_items ĐÚNG NHƯ một
 * transaction thật sự: commit toàn bộ khi thành công, rollback TOÀN BỘ
 * (kể cả các câu insert ĐÃ chạy trước lỗi) khi một bước ghi sau đó thất
 * bại — không có invoice hay invoice_item mồ côi trong cả hai trường
 * hợp.
 *
 * Does NOT:
 * - chạm tới dữ liệu không liên quan — mọi fixture dùng tiền tố tên
 *   DUY NHẤT `VALIDATION_CREATE_INVOICE_*` kèm timestamp, dọn dẹp tường
 *   minh trong `finally`.
 * - claim PASS nếu không có DATABASE_URL — SKIP rõ ràng.
 * - test qua CreateInvoiceService — đây là bằng chứng RIÊNG cho tầng
 *   persistence (UnitOfWork + Repository); orchestration của Service
 *   được test bằng fake ở
 *   `../../modules/invoice/__tests__/create-invoice.service.test.ts`.
 */
const hasDatabaseUrl = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.trim().length > 0;

interface Fixtures {
  propertyName: string;
  roomName: string;
  electricityTariffName: string;
  waterTariffName: string;
  roomId: string;
  electricityTariffId: string;
  waterTariffId: string;
  electricityReadingId: string;
  waterReadingId: string;
}

async function createFixtures(sql: Sql, suffix: string, billingPeriod: Date): Promise<Fixtures> {
  const propertyName = `VALIDATION_CREATE_INVOICE_PROPERTY_${suffix}`;
  const roomName = `VALIDATION_CREATE_INVOICE_ROOM_${suffix}`;
  const electricityTariffName = `VALIDATION_CREATE_INVOICE_ELEC_TARIFF_${suffix}`;
  const waterTariffName = `VALIDATION_CREATE_INVOICE_WATER_TARIFF_${suffix}`;

  const [property] = await sql`INSERT INTO rental_properties (name) VALUES (${propertyName}) RETURNING id`;
  const [room] = await sql`
    INSERT INTO rooms (property_id, name, tenant_count) VALUES (${property.id}, ${roomName}, 4) RETURNING id
  `;

  // effective_from/effective_to CỐ Ý bị chặn trong năm 2024 (KHÔNG NULL ở
  // effective_to) — nằm HOÀN TOÀN NGOÀI khoảng hiệu lực của tariff seed
  // thật (điện: 2025-05-10..2026-12-31; nước: 2026-09-06..NULL). Nếu để
  // effective_to = NULL và effective_from trùng/giao với seed thật, một
  // test file khác chạy ĐỒNG THỜI (node:test chạy song song nhiều file)
  // có thể đọc thấy CẢ tariff seed LẪN tariff fixture này cùng có hiệu
  // lực tại cùng một billingPeriod -> AMBIGUOUS_TARIFF_CONFIGURATION giả —
  // đây là nguyên nhân THẬT đã phát hiện được khi chạy runtime closure
  // (fixture "vĩnh viễn" của file này từng khiến
  // repository-reads.integration.test.ts và
  // invoice.api.integration.test.ts thất bại không ổn định).
  const [electricityTariff] = await sql`
    INSERT INTO electricity_tariffs (
      name, effective_from, effective_to, electricity_vat_rate, people_per_quota_unit, fallback_tier_number
    ) VALUES (${electricityTariffName}, '2024-01-01', '2024-12-31', 0.08, 4, 3)
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
    ) VALUES (${waterTariffName}, '2024-01-01', '2024-12-31', 8500, 80000, 0.05, 0.10)
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
    propertyName,
    roomName,
    electricityTariffName,
    waterTariffName,
    roomId: room.id,
    electricityTariffId: electricityTariff.id,
    waterTariffId: waterTariff.id,
    electricityReadingId: electricityReading.id,
    waterReadingId: waterReading.id,
  };
}

/** invoices xoá TRƯỚC (cascade invoice_items) do FK RESTRICT từ invoices vào các bảng còn lại. */
async function cleanupFixtures(sql: Sql, fixtures: Fixtures, invoiceId: string | null): Promise<void> {
  if (invoiceId !== null) {
    await sql`DELETE FROM invoices WHERE id = ${invoiceId}`;
  }
  await sql`DELETE FROM meter_readings WHERE room_id = ${fixtures.roomId}`;
  await sql`DELETE FROM electricity_tariffs WHERE name = ${fixtures.electricityTariffName}`;
  await sql`DELETE FROM water_tariffs WHERE name = ${fixtures.waterTariffName}`;
  await sql`DELETE FROM rooms WHERE name = ${fixtures.roomName}`;
  await sql`DELETE FROM rental_properties WHERE name = ${fixtures.propertyName}`;
}

function buildNewInvoice(fixtures: Fixtures, billingPeriod: Date): NewInvoice {
  return {
    roomId: fixtures.roomId,
    billingPeriod,
    tenantCountUsed: 4,
    electricityTariffId: fixtures.electricityTariffId,
    waterTariffId: fixtures.waterTariffId,
    electricityBillingMethod: "QUOTA_TIERED",
    waterBillingMethod: "PER_CUBIC_METER",
    electricityReadingId: fixtures.electricityReadingId,
    waterReadingId: fixtures.waterReadingId,
    calculatedTotal: "366994",
    actualChargedAmount: null,
  };
}

function buildInvoiceItems(): NewInvoiceItem[] {
  return [
    {
      category: "ELECTRICITY_TIER",
      tierNumber: 1,
      quantity: "50",
      unitName: "kWh",
      unitPrice: "1984",
      amount: "99200",
      description: "Bậc điện 1",
      displayOrder: 1,
    },
    {
      category: "ELECTRICITY_VAT",
      tierNumber: null,
      quantity: null,
      unitName: null,
      unitPrice: null,
      amount: "19944",
      description: "VAT điện",
      displayOrder: 2,
    },
  ];
}

test(
  "PostgresInvoiceUnitOfWork: commit thật — invoice + toàn bộ invoice_items tồn tại sau khi work() thành công",
  { skip: hasDatabaseUrl ? false : "Cần DATABASE_URL trỏ tới Supabase PostgreSQL thật để chạy test này." },
  async () => {
    const sql = getDatabaseClient();
    // 2024-06-01 CỐ Ý nằm ngoài khoảng hiệu lực của tariff seed thật —
    // xem giải thích ở createFixtures().
    const billingPeriod = new Date("2024-06-01");
    const fixtures = await createFixtures(sql, `COMMIT_${Date.now()}`, billingPeriod);
    let invoiceId: string | null = null;

    try {
      const unitOfWork = new PostgresInvoiceUnitOfWork();
      const result = await unitOfWork.run(async (invoiceRepository) => {
        const createdInvoiceResult = await invoiceRepository.createInvoice(buildNewInvoice(fixtures, billingPeriod));
        if (!createdInvoiceResult.success) {
          return createdInvoiceResult;
        }
        invoiceId = createdInvoiceResult.data.id;
        return invoiceRepository.createInvoiceItems(createdInvoiceResult.data.id, buildInvoiceItems());
      });

      assert.equal(result.success, true);
      assert.notEqual(invoiceId, null);

      const invoiceRows = await sql`SELECT id, calculated_total FROM invoices WHERE id = ${invoiceId}`;
      assert.equal(invoiceRows.length, 1, "Invoice phải tồn tại sau COMMIT");
      assert.equal(invoiceRows[0].calculated_total, "366994.00");

      const itemRows = await sql`SELECT id, display_order FROM invoice_items WHERE invoice_id = ${invoiceId} ORDER BY display_order`;
      assert.equal(itemRows.length, 2, "Cả hai invoice_items phải tồn tại sau COMMIT");
    } finally {
      await cleanupFixtures(sql, fixtures, invoiceId);
    }
  }
);

test(
  "PostgresInvoiceUnitOfWork: rollback thật — vi phạm UNIQUE(invoice_id, display_order) THẬT ở item thứ hai khiến invoice + item đầu (đã insert trong cùng transaction) cũng biến mất",
  { skip: hasDatabaseUrl ? false : "Cần DATABASE_URL trỏ tới Supabase PostgreSQL thật để chạy test này." },
  async () => {
    const sql = getDatabaseClient();
    const billingPeriod = new Date("2024-06-01");
    const fixtures = await createFixtures(sql, `ROLLBACK_${Date.now()}`, billingPeriod);

    try {
      const invoicesBefore = await sql`SELECT COUNT(*)::text AS count FROM invoices WHERE room_id = ${fixtures.roomId}`;
      assert.equal(invoicesBefore[0].count, "0");

      const items = buildInvoiceItems();

      const unitOfWork = new PostgresInvoiceUnitOfWork();
      const result = await unitOfWork.run(async (invoiceRepository) => {
        const createdInvoiceResult = await invoiceRepository.createInvoice(buildNewInvoice(fixtures, billingPeriod));
        if (!createdInvoiceResult.success) {
          return createdInvoiceResult;
        }
        // Cố ý đặt displayOrder TRÙNG (1) ở cả hai item — item đầu insert
        // THÀNH CÔNG trong transaction, item thứ hai vi phạm THẬT
        // UNIQUE(invoice_id, display_order) (migration 001) -> lỗi ghi
        // thật, không phải fail() giả lập — chứng minh rollback hoàn tác
        // CẢ câu insert invoice LẪN câu insert item đầu đã chạy trước đó.
        return invoiceRepository.createInvoiceItems(createdInvoiceResult.data.id, [
          { ...items[0], displayOrder: 1 },
          { ...items[1], displayOrder: 1 },
        ]);
      });

      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error.code, "DATABASE_WRITE_FAILED");
      }

      const invoicesAfter = await sql`SELECT COUNT(*)::text AS count FROM invoices WHERE room_id = ${fixtures.roomId}`;
      assert.equal(invoicesAfter[0].count, "0", "Không được còn invoice mồ côi sau rollback");

      const itemsAfter = await sql`
        SELECT COUNT(*)::text AS count
        FROM invoice_items ii
        JOIN invoices i ON i.id = ii.invoice_id
        WHERE i.room_id = ${fixtures.roomId}
      `;
      assert.equal(itemsAfter[0].count, "0", "Không được còn invoice_items mồ côi sau rollback (kể cả item đầu đã insert thành công)");
    } finally {
      // Không có invoiceId hợp lệ để xoá riêng — rollback đã tự xoá invoice.
      await cleanupFixtures(sql, fixtures, null);
      await closeDatabaseClient();
    }
  }
);
