// SPDX-License-Identifier: MIT

import { Result } from "../shared/result";
import { Invoice } from "../modules/invoice/invoice.model";

/**
 * Responsibility:
 * Hợp đồng cho việc kiểm tra invoice đã tồn tại cho một (room,
 * billingPeriod) hay chưa — khớp `UNIQUE(room_id, billing_period)`
 * trong migration 001.
 *
 * IMPORTANT — khác với Room/MeterReading/Tariff repository:
 * "Không tìm thấy" ở đây là một KẾT QUẢ HỢP LỆ, không phải lỗi —
 * `findByRoomAndPeriod` trả `Result<Invoice | null>`, KHÔNG fail với
 * NOT_FOUND. Lý do: mục đích chính của thao tác này (trong CreateInvoice
 * workflow tương lai) là TRẢ LỜI CÂU HỎI "invoice cho kỳ này đã tồn tại
 * chưa?" trước khi tạo mới — "chưa tồn tại" là nhánh THÀNH CÔNG bình
 * thường (được phép tạo invoice mới), không phải một thất bại cần
 * Result lỗi. Ngược lại, Room/MeterReading/Tariff là các PHỤ THUỘC BẮT
 * BUỘC để tính toán — thiếu chúng nghĩa là không thể tiếp tục, nên
 * "không tìm thấy" ở đó đúng là một lỗi (`ROOM_NOT_FOUND`, ...).
 *
 * Failure conditions (chỉ khi bản thân query thất bại):
 * - `DATABASE_READ_FAILED`
 *
 * Does NOT:
 * - chứa thao tác ghi (insert invoice/invoice_items). Việc tạo invoice
 *   thuộc về CreateInvoice workflow — KHÔNG được implement ở task này
 *   (xem docs/DATABASE_ACCESS.md mục "Deliberately deferred").
 */
export interface InvoiceRepository {
  findByRoomAndPeriod(roomId: string, billingPeriod: Date): Promise<Result<Invoice | null>>;
}
