// SPDX-License-Identifier: MIT

import { Invoice, InvoiceItem } from "./invoice.model";
import { RoomRepository } from "../../repositories/room.repository";
import { MeterReadingRepository } from "../../repositories/meter-reading.repository";
import { ElectricityTariffRepository } from "../../repositories/electricity-tariff.repository";
import { WaterTariffRepository } from "../../repositories/water-tariff.repository";
import { InvoiceRepository } from "../../repositories/invoice.repository";
import { InvoiceUnitOfWork } from "../../repositories/invoice-unit-of-work";
import { FallbackElectricityResult, TieredElectricityResult, WaterChargeResult } from "../../calculation/types/calculation.types";
import { InvoiceTotalResult } from "../../calculation/invoice/calculate-invoice-total";

/**
 * Trách nhiệm:
 * Khai báo type dùng chung của `CreateInvoiceService` — input, output,
 * và các dependency (Repository/UnitOfWork) mà Service cần — tách khỏi
 * `create-invoice.service.ts` để file đó chỉ chứa logic điều phối.
 *
 * Không chịu trách nhiệm: chứa logic — chỉ type/interface.
 */

/**
 * `electricityBillingMethod`/`waterBillingMethod` CỐ Ý là `string`, KHÔNG
 * phải `ElectricityBillingMethod`/`WaterBillingMethod`, vì
 * `CreateInvoiceInput` là một RANH GIỚI NGHIỆP VỤ THỜI GIAN CHẠY (runtime
 * business boundary — ví dụ sẽ nhận dữ liệu từ một Controller/HTTP body
 * trong task sau) và phải TỪ CHỐI giá trị không hợp lệ một cách rõ ràng
 * (`VALIDATION_ERROR`) thay vì chỉ dựa vào union type của TypeScript
 * (vốn chỉ kiểm tra lúc biên dịch, không kiểm tra dữ liệu thời gian
 * chạy thực sự đến từ đâu). `CreateInvoiceService.execute` tự validate
 * và thu hẹp (narrow) hai field này trước khi gọi Calculation Core — xem
 * `create-invoice.service.ts`.
 */
export interface CreateInvoiceInput {
  roomId: string;
  billingPeriod: Date;
  electricityBillingMethod: string;
  waterBillingMethod: string;
  actualChargedAmount: string | null;
}

/**
 * Kết quả trả về đủ để một Controller tương lai hiển thị hoá đơn mà
 * KHÔNG cần tính lại — bao gồm cả invoice/items đã persist LẪN kết quả
 * tính toán chi tiết (Calculation Core). `electricity` là discriminated
 * union theo `method` để caller biết đọc `result` dưới dạng type nào mà
 * không cần ép kiểu (type cast).
 *
 * Không chịu trách nhiệm: lộ `DatabaseExecutor`, Postgres.js row, câu SQL, hay
 * `bigint` — mọi field là JSON-safe (xem
 * backend/src/calculation/__tests__/public-json-safety.test.ts cho
 * nguyên tắc tương tự ở Calculation Core).
 */
export interface CreateInvoiceResult {
  invoice: Invoice;
  items: InvoiceItem[];

  electricity:
    | { method: "QUOTA_TIERED"; result: TieredElectricityResult }
    | { method: "FALLBACK_TIER_FLAT"; result: FallbackElectricityResult };

  water: WaterChargeResult;

  invoiceTotal: InvoiceTotalResult;

  /** null khi `actualChargedAmount` đầu vào là null — xem "Không chịu trách nhiệm" của calculate-billing-difference.ts. */
  billingDifference: string | null;
}

/**
 * Dependency injected qua constructor của `CreateInvoiceService` — toàn
 * bộ là INTERFACE (không phải class Postgres cụ thể), để test Service
 * bằng fake repository/unit-of-work mà không cần PostgreSQL thật (xem
 * `__tests__/create-invoice.service.test.ts`).
 *
 * `invoiceRepository` ở đây được dùng CHỈ cho pre-check
 * `findByRoomAndPeriod` (đọc, ngoài transaction) — thao tác GHI
 * (createInvoice/createInvoiceItems) luôn đi qua `invoiceUnitOfWork`,
 * KHÔNG bao giờ gọi trực tiếp qua field này, để đảm bảo invoice +
 * invoice_items luôn nằm CHUNG một transaction (xem
 * `../../repositories/invoice-unit-of-work.ts`).
 */
export interface CreateInvoiceDependencies {
  roomRepository: RoomRepository;
  invoiceRepository: InvoiceRepository;
  meterReadingRepository: MeterReadingRepository;
  electricityTariffRepository: ElectricityTariffRepository;
  waterTariffRepository: WaterTariffRepository;
  invoiceUnitOfWork: InvoiceUnitOfWork;
}
