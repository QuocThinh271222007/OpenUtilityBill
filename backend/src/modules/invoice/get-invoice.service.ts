// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../shared/result";
import { calculateBillingDifference } from "../../calculation/invoice/calculate-billing-difference";
import { isFirstDayOfMonthUtc, isPositiveIntegerId } from "./invoice-input-validation";
import { GetInvoiceDependencies, GetInvoiceInput, GetInvoiceResult } from "./get-invoice.types";

/**
 * Trách nhiệm:
 * Đọc lại một Invoice ĐÃ TỒN TẠI (lịch sử) cùng breakdown của nó, cho
 * `GET /api/v1/invoices?roomId=...&billingPeriod=...` (Route/Controller
 * — backend/src/modules/invoice/invoice.controller.ts).
 *
 * Input/Output: xem `get-invoice.types.ts`.
 *
 * Điều kiện lỗi:
 * - `VALIDATION_ERROR`: roomId/billingPeriod không hợp lệ hình dạng.
 * - `INVOICE_NOT_FOUND`: không có invoice nào cho (roomId, billingPeriod).
 * - `DATABASE_READ_FAILED`: một trong hai lần đọc Repository thất bại.
 * - lỗi propagate từ `calculateBillingDifference` (hiếm — chỉ xảy ra
 *   nếu dữ liệu đã lưu bị hỏng, vì `actualChargedAmount` đã được
 *   `CreateInvoiceService` validate vừa NUMERIC(14, 2) trước khi ghi).
 *
 * Important invariant — KHÔNG tính lại hoá đơn:
 * Đây là readback LỊCH SỬ — Service này KHÔNG gọi bất kỳ hàm tính điện/
 * nước nào của Calculation Core (calculateMeterUsage,
 * calculateTieredElectricity, calculateWaterCharge, ...). Chỉ
 * `calculateBillingDifference` được gọi, vì đó là một phép TRỪ đơn giản
 * giữa hai giá trị ĐÃ LƯU (`calculatedTotal`, `actualChargedAmount`) —
 * KHÔNG phải tính lại hoá đơn từ chỉ số công tơ/tariff. Đọc lại một
 * invoice cũ, sau khi tariff/tenant count đã đổi, PHẢI trả về đúng số
 * tiền đã tính tại thời điểm tạo hoá đơn đó — xem
 * docs/CREATE_INVOICE_WORKFLOW.md mục "Room snapshot" và
 * `../invoice/invoice.model.ts` mục "Why Invoice snapshots configuration".
 *
 * Không chịu trách nhiệm:
 * - tính lại breakdown — `items` là dữ liệu ĐÃ LƯU, đọc nguyên văn qua
 *   `findItemsByInvoiceId` (đã `ORDER BY display_order ASC`).
 * - chứa SQL/Postgres.js import — chỉ phụ thuộc `InvoiceRepository`.
 * - implement Controller/route.
 */
export class GetInvoiceService {
  constructor(private readonly deps: GetInvoiceDependencies) {}

  async execute(input: GetInvoiceInput): Promise<Result<GetInvoiceResult>> {
    if (!isPositiveIntegerId(input.roomId)) {
      return fail("VALIDATION_ERROR", `roomId không hợp lệ (phải là chuỗi số nguyên dương): "${input.roomId}".`);
    }
    if (!isFirstDayOfMonthUtc(input.billingPeriod)) {
      return fail("VALIDATION_ERROR", "billingPeriod phải là một ngày hợp lệ và là ngày đầu tiên của tháng (UTC).");
    }

    const invoiceResult = await this.deps.invoiceRepository.findByRoomAndPeriod(input.roomId, input.billingPeriod);
    if (!invoiceResult.success) {
      return invoiceResult;
    }
    if (invoiceResult.data === null) {
      return fail(
        "INVOICE_NOT_FOUND",
        `Không tìm thấy invoice cho room ${input.roomId} kỳ ${input.billingPeriod.toISOString().slice(0, 10)}.`
      );
    }
    const invoice = invoiceResult.data;

    const itemsResult = await this.deps.invoiceRepository.findItemsByInvoiceId(invoice.id);
    if (!itemsResult.success) {
      return itemsResult;
    }

    let billingDifference: string | null = null;
    if (invoice.actualChargedAmount !== null) {
      const billingDifferenceResult = calculateBillingDifference({
        actualChargedAmount: invoice.actualChargedAmount,
        legalRoundedTotalVnd: invoice.calculatedTotal,
      });
      if (!billingDifferenceResult.success) {
        return billingDifferenceResult;
      }
      billingDifference = billingDifferenceResult.data;
    }

    return ok({ invoice, items: itemsResult.data, billingDifference });
  }
}
