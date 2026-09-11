// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../shared/result";
import { logDatabaseError } from "../../database/postgres-client";
import type { DatabaseExecutor } from "../../database/database.types";
import { ElectricityBillingMethod, WaterBillingMethod } from "../../modules/tariff/tariff.model";
import { Invoice, InvoiceItem, InvoiceItemCategory } from "../../modules/invoice/invoice.model";
import { InvoiceRepository, NewInvoice, NewInvoiceItem } from "../invoice.repository";

/**
 * Responsibility:
 * Implementation Postgres.js của `InvoiceRepository` — nơi DUY NHẤT
 * chứa SQL truy vấn/ghi bảng `invoices` và `invoice_items`.
 *
 * Does NOT:
 * - fail với NOT_FOUND khi `findByRoomAndPeriod` không có invoice — xem
 *   giải thích trong `../invoice.repository.ts`.
 * - tự mở transaction cho `createInvoice`/`createInvoiceItems` — cả hai
 *   chạy bằng `this.sql` (client toàn cục HOẶC transaction context,
 *   tuỳ constructor được gọi với gì) — xem
 *   `../invoice-unit-of-work.ts`.
 * - dùng `sql.unsafe` hay ghép chuỗi SQL — mọi giá trị tham số hoá qua
 *   `${...}`.
 */
interface InvoiceRow {
  id: string;
  room_id: string;
  billing_period: Date;
  tenant_count_used: number;
  electricity_tariff_id: string;
  water_tariff_id: string;
  electricity_billing_method: ElectricityBillingMethod;
  water_billing_method: WaterBillingMethod;
  electricity_reading_id: string;
  water_reading_id: string | null;
  calculated_total: string;
  actual_charged_amount: string | null;
  created_at: Date;
}

interface InvoiceItemRow {
  id: string;
  invoice_id: string;
  category: InvoiceItemCategory;
  tier_number: number | null;
  quantity: string | null;
  unit_name: string | null;
  unit_price: string | null;
  amount: string;
  description: string | null;
  display_order: number;
}

function mapInvoiceRow(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    roomId: row.room_id,
    billingPeriod: row.billing_period,
    tenantCountUsed: row.tenant_count_used,
    electricityTariffId: row.electricity_tariff_id,
    waterTariffId: row.water_tariff_id,
    electricityBillingMethod: row.electricity_billing_method,
    waterBillingMethod: row.water_billing_method,
    electricityReadingId: row.electricity_reading_id,
    waterReadingId: row.water_reading_id,
    calculatedTotal: row.calculated_total,
    actualChargedAmount: row.actual_charged_amount,
    createdAt: row.created_at,
  };
}

function mapInvoiceItemRow(row: InvoiceItemRow): InvoiceItem {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    category: row.category,
    tierNumber: row.tier_number,
    quantity: row.quantity,
    unitName: row.unit_name,
    unitPrice: row.unit_price,
    amount: row.amount,
    description: row.description,
    displayOrder: row.display_order,
  };
}

/**
 * "Đây có phải lỗi vi phạm UNIQUE constraint (SQLSTATE 23505) không?"
 * — kiểm tra CẤU TRÚC (structural), không import type `PostgresError`
 * của thư viện `postgres`, vì đây là mapping DUY NHẤT dự án cần (invoice
 * trùng `UNIQUE(room_id, billing_period)`) — KHÔNG xây dựng một khung
 * (framework) dịch SQLSTATE tổng quát cho mọi constraint có thể có
 * trong tương lai (xem docs/DATABASE_ACCESS.md mục "Error translation").
 * `code` ở đây LÀ SQLSTATE do PostgreSQL trả về, không phải một field
 * do Postgres.js tự đặt tên tuỳ ý — xem
 * `node_modules/postgres/src/connection.js` (bảng `errorFields`, ánh xạ
 * ký tự 'C' -> `code`) và `node_modules/postgres/types/index.d.ts`
 * (`PostgresError.code: string`).
 */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "23505";
}

export class PostgresInvoiceRepository implements InvoiceRepository {
  constructor(private readonly sql: DatabaseExecutor) {}

  async findByRoomAndPeriod(roomId: string, billingPeriod: Date): Promise<Result<Invoice | null>> {
    try {
      const rows = await this.sql<InvoiceRow[]>`
        SELECT id, room_id, billing_period, tenant_count_used,
               electricity_tariff_id, water_tariff_id,
               electricity_billing_method, water_billing_method,
               electricity_reading_id, water_reading_id,
               calculated_total, actual_charged_amount, created_at
        FROM invoices
        WHERE room_id = ${roomId}
          AND billing_period = ${billingPeriod}
      `;

      if (rows.length === 0) {
        // "Chưa có invoice cho kỳ này" là kết quả THÀNH CÔNG hợp lệ —
        // xem ../invoice.repository.ts.
        return ok(null);
      }

      return ok(mapInvoiceRow(rows[0]));
    } catch (error) {
      logDatabaseError("PostgresInvoiceRepository.findByRoomAndPeriod", error);
      return fail("DATABASE_READ_FAILED", "Không thể đọc dữ liệu invoice từ database.");
    }
  }

  /**
   * Failure conditions:
   * - `INVOICE_ALREADY_EXISTS` khi vi phạm `UNIQUE(room_id,
   *   billing_period)` (SQLSTATE 23505) — bảo vệ race condition mà
   *   pre-check `findByRoomAndPeriod` của Service KHÔNG đủ để ngăn (hai
   *   request đọc "chưa có invoice" cùng lúc rồi cùng insert) — xem
   *   docs/CREATE_INVOICE_WORKFLOW.md mục "Duplicate invoice / race
   *   condition".
   * - `DATABASE_WRITE_FAILED` cho mọi lỗi ghi khác — KHÔNG lộ message
   *   PostgreSQL gốc (tên constraint, câu SQL, ...) ra ngoài Result.
   */
  async createInvoice(input: NewInvoice): Promise<Result<Invoice>> {
    try {
      const rows = await this.sql<InvoiceRow[]>`
        INSERT INTO invoices (
          room_id, billing_period, tenant_count_used,
          electricity_tariff_id, water_tariff_id,
          electricity_billing_method, water_billing_method,
          electricity_reading_id, water_reading_id,
          calculated_total, actual_charged_amount
        ) VALUES (
          ${input.roomId}, ${input.billingPeriod}, ${input.tenantCountUsed},
          ${input.electricityTariffId}, ${input.waterTariffId},
          ${input.electricityBillingMethod}, ${input.waterBillingMethod},
          ${input.electricityReadingId}, ${input.waterReadingId},
          ${input.calculatedTotal}, ${input.actualChargedAmount}
        )
        RETURNING id, room_id, billing_period, tenant_count_used,
                  electricity_tariff_id, water_tariff_id,
                  electricity_billing_method, water_billing_method,
                  electricity_reading_id, water_reading_id,
                  calculated_total, actual_charged_amount, created_at
      `;

      return ok(mapInvoiceRow(rows[0]));
    } catch (error) {
      if (isUniqueViolation(error)) {
        return fail(
          "INVOICE_ALREADY_EXISTS",
          `Invoice cho room ${input.roomId} kỳ ${input.billingPeriod.toISOString().slice(0, 10)} đã tồn tại.`
        );
      }
      logDatabaseError("PostgresInvoiceRepository.createInvoice", error);
      return fail("DATABASE_WRITE_FAILED", "Không thể ghi dữ liệu invoice vào database.");
    }
  }

  /**
   * Chèn TỪNG dòng invoice_item bằng một vòng lặp tuần tự đơn giản —
   * số dòng breakdown luôn nhỏ (vài dòng bậc điện + VAT + nước), không
   * cần một bulk-insert helper phức tạp chỉ để tối ưu hiệu năng chưa có
   * nhu cầu chứng minh (readable > clever).
   *
   * Failure conditions:
   * - `DATABASE_WRITE_FAILED` khi bất kỳ câu insert nào thất bại — dừng
   *   ngay tại dòng lỗi đầu tiên (fail-fast), không tiếp tục chèn các
   *   dòng còn lại.
   */
  async createInvoiceItems(invoiceId: string, items: NewInvoiceItem[]): Promise<Result<InvoiceItem[]>> {
    const created: InvoiceItem[] = [];

    try {
      for (const item of items) {
        const rows = await this.sql<InvoiceItemRow[]>`
          INSERT INTO invoice_items (
            invoice_id, category, tier_number,
            quantity, unit_name, unit_price, amount,
            description, display_order
          ) VALUES (
            ${invoiceId}, ${item.category}, ${item.tierNumber},
            ${item.quantity}, ${item.unitName}, ${item.unitPrice}, ${item.amount},
            ${item.description}, ${item.displayOrder}
          )
          RETURNING id, invoice_id, category, tier_number,
                    quantity, unit_name, unit_price, amount,
                    description, display_order
        `;
        created.push(mapInvoiceItemRow(rows[0]));
      }

      return ok(created);
    } catch (error) {
      logDatabaseError("PostgresInvoiceRepository.createInvoiceItems", error);
      return fail("DATABASE_WRITE_FAILED", "Không thể ghi dữ liệu invoice_items vào database.");
    }
  }

  /**
   * `ORDER BY display_order ASC` tường minh — KHÔNG dựa vào thứ tự hàng
   * tự nhiên PostgreSQL trả về (không được đảm bảo mà không có ORDER BY).
   */
  async findItemsByInvoiceId(invoiceId: string): Promise<Result<InvoiceItem[]>> {
    try {
      const rows = await this.sql<InvoiceItemRow[]>`
        SELECT id, invoice_id, category, tier_number,
               quantity, unit_name, unit_price, amount,
               description, display_order
        FROM invoice_items
        WHERE invoice_id = ${invoiceId}
        ORDER BY display_order ASC
      `;

      return ok(rows.map(mapInvoiceItemRow));
    } catch (error) {
      logDatabaseError("PostgresInvoiceRepository.findItemsByInvoiceId", error);
      return fail("DATABASE_READ_FAILED", "Không thể đọc dữ liệu invoice_items từ database.");
    }
  }
}

/** Xuất riêng để unit-test ánh xạ row mà không cần database thật. */
export const __testing = { mapInvoiceRow, mapInvoiceItemRow, isUniqueViolation };
