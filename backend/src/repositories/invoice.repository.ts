// SPDX-License-Identifier: MIT

import { Result } from "../shared/result";
import { Invoice, InvoiceItem, InvoiceItemCategory } from "../modules/invoice/invoice.model";
import { ElectricityBillingMethod, WaterBillingMethod } from "../modules/tariff/tariff.model";

/**
 * Trách nhiệm:
 * Dữ liệu ĐẦU VÀO để tạo một Invoice mới — CỐ Ý là một type riêng, KHÔNG
 * dùng `Omit<Invoice, "id" | "createdAt">`/`Partial<Invoice>`, để hợp
 * đồng ghi dữ liệu tường minh, dễ đọc độc lập với hình dạng của
 * `Invoice` (domain read model) dù hai type trùng lặp phần lớn field —
 * xem CreateInvoiceService (backend/src/modules/invoice/) để biết ai
 * xây dựng giá trị này.
 *
 * `id` và `createdAt` không xuất hiện ở đây vì cả hai do PostgreSQL sinh
 * ra (BIGINT IDENTITY, `DEFAULT now()`) — Repository trả `Invoice` đầy
 * đủ (bao gồm cả hai field này) từ `RETURNING` của câu INSERT, không
 * phải Service tự đoán trước.
 */
export interface NewInvoice {
  roomId: string;
  billingPeriod: Date;
  tenantCountUsed: number;
  electricityTariffId: string;
  waterTariffId: string;
  electricityBillingMethod: ElectricityBillingMethod;
  waterBillingMethod: WaterBillingMethod;
  electricityReadingId: string;
  waterReadingId: string | null;
  calculatedTotal: string;
  actualChargedAmount: string | null;
}

/**
 * Dữ liệu ĐẦU VÀO để tạo một dòng InvoiceItem — cùng lý do tách riêng
 * khỏi `InvoiceItem` như `NewInvoice` ở trên. `invoiceId` KHÔNG xuất
 * hiện ở đây vì `createInvoiceItems` nhận `invoiceId` như một tham số
 * riêng (một invoice luôn tạo nhiều item cùng lúc, xem bên dưới).
 */
export interface NewInvoiceItem {
  category: InvoiceItemCategory;
  tierNumber: number | null;
  quantity: string | null;
  unitName: string | null;
  unitPrice: string | null;
  amount: string;
  description: string | null;
  displayOrder: number;
}

/**
 * Trách nhiệm:
 * Hợp đồng đọc VÀ ghi cho `Invoice`/`InvoiceItem` — ranh giới persistence
 * mà `CreateInvoiceService` (backend/src/modules/invoice/) phụ thuộc
 * vào, không phụ thuộc trực tiếp Postgres.js.
 *
 * `findByRoomAndPeriod`:
 * IMPORTANT — khác với Room/MeterReading/Tariff repository:
 * "Không tìm thấy" ở đây là một KẾT QUẢ HỢP LỆ, không phải lỗi —
 * `findByRoomAndPeriod` trả `Result<Invoice | null>`, KHÔNG fail với
 * NOT_FOUND. Lý do: mục đích chính của thao tác này (trong CreateInvoice
 * workflow) là TRẢ LỜI CÂU HỎI "invoice cho kỳ này đã tồn tại chưa?"
 * trước khi tạo mới — "chưa tồn tại" là nhánh THÀNH CÔNG bình thường
 * (được phép tạo invoice mới), không phải một thất bại cần Result lỗi.
 * Ngược lại, Room/MeterReading/Tariff là các PHỤ THUỘC BẮT BUỘC để tính
 * toán — thiếu chúng nghĩa là không thể tiếp tục, nên "không tìm thấy"
 * ở đó đúng là một lỗi (`ROOM_NOT_FOUND`, ...).
 *
 * Điều kiện lỗi:
 * - `findByRoomAndPeriod`: `DATABASE_READ_FAILED` khi bản thân query
 *   thất bại.
 * - `createInvoice`: `INVOICE_ALREADY_EXISTS` khi một invoice cho cùng
 *   (roomId, billingPeriod) đã tồn tại — kể cả khi Service đã pre-check
 *   bằng `findByRoomAndPeriod`, một request khác có thể đã insert xen
 *   giữa (race condition); `DATABASE_WRITE_FAILED` cho lỗi ghi khác.
 * - `createInvoiceItems`: `DATABASE_WRITE_FAILED` khi câu ghi thất bại.
 * - `findItemsByInvoiceId`: `DATABASE_READ_FAILED` khi câu query thất
 *   bại. KHÔNG fail với NOT_FOUND khi một invoice hợp lệ không có dòng
 *   item nào (không nên xảy ra trong thực tế vì `createInvoiceItems`
 *   luôn chạy cùng transaction với `createInvoice`, nhưng đọc lại một
 *   mảng rỗng vẫn là một kết quả THÀNH CÔNG hợp lệ về mặt kiểu dữ liệu,
 *   không phải lỗi).
 *
 * Bất biến quan trọng:
 * `createInvoice`/`createInvoiceItems` KHÔNG tự mở transaction riêng —
 * cả hai chạy bằng đúng `DatabaseExecutor` được truyền vào constructor
 * của implementation, để invoice + invoice_items có thể nằm chung MỘT
 * transaction do caller (xem
 * `../repositories/invoice-unit-of-work.ts`) kiểm soát. Gọi hai method
 * này ngoài một transaction sẽ mất tính nguyên tử (atomicity).
 *
 * Không chịu trách nhiệm:
 * - tự quyết định khi nào mở/đóng transaction — xem
 *   `invoice-unit-of-work.ts`.
 */
export interface InvoiceRepository {
  findByRoomAndPeriod(roomId: string, billingPeriod: Date): Promise<Result<Invoice | null>>;
  createInvoice(input: NewInvoice): Promise<Result<Invoice>>;
  createInvoiceItems(invoiceId: string, items: NewInvoiceItem[]): Promise<Result<InvoiceItem[]>>;

  /**
   * Đọc lại các dòng breakdown ĐÃ LƯU của một invoice, sắp xếp theo
   * `displayOrder` tăng dần (`ORDER BY display_order ASC` — không dựa
   * vào thứ tự hàng tự nhiên của PostgreSQL). Dùng cho readback lịch sử
   * (`GetInvoiceService`, backend/src/modules/invoice/) — KHÔNG tính lại
   * breakdown từ Calculation Core.
   */
  findItemsByInvoiceId(invoiceId: string): Promise<Result<InvoiceItem[]>>;
}
