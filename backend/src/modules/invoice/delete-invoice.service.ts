// SPDX-License-Identifier: MIT

import { Result, fail } from "../../shared/result";
import { isPositiveIntegerId } from "./invoice-input-validation";
import { DeleteInvoiceDependencies } from "./delete-invoice.types";

/**
 * Trách nhiệm:
 * Xoá một Invoice ĐÃ TỒN TẠI (hành động phá huỷ lịch sử tài chính, được
 * yêu cầu tường minh — xem docs/MANAGEMENT_API.md mục "Invoice delete").
 * Cho `DELETE /api/v1/invoices/:invoiceId`
 * (backend/src/modules/invoice/invoice.controller.ts).
 *
 * Điều kiện lỗi:
 * - `VALIDATION_ERROR`: invoiceId không hợp lệ hình dạng (phải là chuỗi
 *   số nguyên dương).
 * - `INVOICE_NOT_FOUND`: propagate từ Repository khi id không tồn tại.
 * - `DATABASE_WRITE_FAILED`: propagate từ Repository cho lỗi ghi khác.
 *
 * Important invariant — KHÔNG cascade thủ công, KHÔNG chạm dữ liệu
 * khác:
 * `invoiceRepository.deleteById` chỉ chạy MỘT câu `DELETE FROM invoices
 * WHERE id = ...` — `invoice_items` của invoice này tự biến mất qua
 * `invoice_items.invoice_id ON DELETE CASCADE` đã có sẵn ở schema
 * (migration 001). Service này KHÔNG tự xoá invoice_items trước, và
 * KHÔNG BAO GIỜ đụng đến room/meter_readings/electricity_tariffs/
 * water_tariffs — xoá một invoice không được phép làm mất số liệu công
 * tơ hay biểu giá đã dùng để tính hoá đơn đó.
 *
 * Không chịu trách nhiệm:
 * - chứa SQL/Postgres.js import — chỉ phụ thuộc `InvoiceRepository`.
 * - hỗ trợ khôi phục/xem lại lịch sử sau khi xoá (không có revision) —
 *   xem docs/MANAGEMENT_API.md.
 * - implement Controller/route.
 */
export class DeleteInvoiceService {
  constructor(private readonly deps: DeleteInvoiceDependencies) {}

  async execute(invoiceId: string): Promise<Result<{ id: string }>> {
    if (!isPositiveIntegerId(invoiceId)) {
      return fail("VALIDATION_ERROR", `invoiceId không hợp lệ (phải là chuỗi số nguyên dương): "${invoiceId}".`);
    }

    return this.deps.invoiceRepository.deleteById(invoiceId);
  }
}
