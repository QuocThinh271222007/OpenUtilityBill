// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../shared/result";
import { MeterReading } from "../meter-reading/meter-reading.model";
import { ElectricityBillingMethod, WaterBillingMethod } from "../tariff/tariff.model";
import { NewInvoice } from "../../repositories/invoice.repository";
import { calculateMeterUsage } from "../../calculation/meter/calculate-meter-usage";
import { calculateTieredElectricity } from "../../calculation/electricity/calculate-tiered-electricity";
import { calculateFallbackElectricity } from "../../calculation/electricity/calculate-fallback-electricity";
import { calculateWaterCharge } from "../../calculation/water/calculate-water-charge";
import { calculateInvoiceTotal } from "../../calculation/invoice/calculate-invoice-total";
import { calculateBillingDifference } from "../../calculation/invoice/calculate-billing-difference";
import { ElectricityTierInput, FallbackElectricityResult, TieredElectricityResult } from "../../calculation/types/calculation.types";
import { buildInvoiceItemBreakdown } from "./build-invoice-item-breakdown";
import { CreateInvoiceDependencies, CreateInvoiceInput, CreateInvoiceResult } from "./create-invoice.types";
import { isFirstDayOfMonthUtc, isPositiveIntegerId, isValidActualChargedAmountScale } from "./invoice-input-validation";

/**
 * Trách nhiệm:
 * Orchestrator (Service) cho workflow CreateInvoice — nối Repository
 * (đọc Room/MeterReading/Tariff/Invoice), Calculation Core (điện/nước/
 * tổng hoá đơn), và persistence (InvoiceUnitOfWork) thành MỘT quy trình
 * fail-fast duy nhất. Xem docs/CREATE_INVOICE_WORKFLOW.md cho sơ đồ đầy
 * đủ của luồng này.
 *
 * Input/Output: xem `create-invoice.types.ts`.
 *
 * Important invariant — ranh giới kiến trúc (KHOÁ, xem docs/ARCHITECTURE.md):
 * File này KHÔNG import Postgres.js, `DatabaseExecutor`, hay bất kỳ
 * class `Postgres*Repository` cụ thể nào — chỉ phụ thuộc vào các
 * interface Repository/`InvoiceUnitOfWork`. Việc GHI invoice luôn đi
 * qua `InvoiceUnitOfWork.run(...)` — Service không tự dựng transaction
 * hay tự new một Repository nào bằng transaction context, vì làm vậy sẽ
 * rò rỉ chi tiết cài đặt persistence vào Service (xem
 * `../../repositories/invoice-unit-of-work.ts`).
 *
 * Important invariant — thứ tự đọc trước khi ghi:
 * TOÀN BỘ bước đọc (Room, Invoice pre-check, MeterReading, Tariff) VÀ
 * TOÀN BỘ bước tính toán (Calculation Core) đều chạy TRƯỚC khi
 * `invoiceUnitOfWork.run(...)` được gọi — transaction chỉ bao bọc đúng
 * hai câu ghi (`createInvoice`, `createInvoiceItems`), không giữ mở
 * trong lúc tính toán CPU hay chờ các câu đọc khác (xem
 * database/transaction.ts mục "Không chịu trách nhiệm").
 *
 * Important invariant — snapshot số người ở:
 * `room.tenantCount` được đọc ĐÚNG MỘT LẦN và dùng lại cho MỌI nơi cần
 * (quota điện, nước PER_PERSON, `invoice.tenantCountUsed`) — không đọc
 * lại Room giữa chừng, đảm bảo một nguồn sự thật duy nhất cho cả quy
 * trình tính toán VÀ giá trị được lưu (xem
 * `../invoice/invoice.model.ts` mục "Why Invoice snapshots configuration").
 *
 * Không chịu trách nhiệm:
 * - chứa câu SQL nào (không `sql\`...\``, không `sql.unsafe`).
 * - tự tính điện/nước bằng phép toán JS number — mọi phép tính đi qua
 *   Calculation Core (xem docs/NUMERIC_PRECISION.md).
 * - cho phép caller tự chọn tariffId/readingId — Service TỰ chọn tariff
 *   đang hiệu lực theo billingPeriod và TỰ tra reading theo
 *   (roomId, billingPeriod, utilityType), ngăn một API consumer giả
 *   mạo tham chiếu lịch sử (xem docs/CREATE_INVOICE_WORKFLOW.md mục
 *   "Cross-table business invariants").
 * - implement Controller/route — đây thuần tuý là lớp Service, không
 *   biết gì về HTTP.
 */

const ELECTRICITY_BILLING_METHODS: ReadonlySet<string> = new Set<ElectricityBillingMethod>([
  "QUOTA_TIERED",
  "FALLBACK_TIER_FLAT",
]);
const WATER_BILLING_METHODS: ReadonlySet<string> = new Set<WaterBillingMethod>(["PER_CUBIC_METER", "PER_PERSON"]);

interface ValidatedMethods {
  electricityBillingMethod: ElectricityBillingMethod;
  waterBillingMethod: WaterBillingMethod;
}

function validateCreateInvoiceInput(input: CreateInvoiceInput): Result<ValidatedMethods> {
  if (!isPositiveIntegerId(input.roomId)) {
    return fail("VALIDATION_ERROR", `roomId không hợp lệ (phải là chuỗi số nguyên dương): "${input.roomId}".`);
  }
  if (!isFirstDayOfMonthUtc(input.billingPeriod)) {
    return fail("VALIDATION_ERROR", "billingPeriod phải là một ngày hợp lệ và là ngày đầu tiên của tháng (UTC).");
  }
  if (!ELECTRICITY_BILLING_METHODS.has(input.electricityBillingMethod)) {
    return fail(
      "VALIDATION_ERROR",
      `electricityBillingMethod không hợp lệ: "${input.electricityBillingMethod}" (chỉ chấp nhận QUOTA_TIERED hoặc FALLBACK_TIER_FLAT).`
    );
  }
  if (!WATER_BILLING_METHODS.has(input.waterBillingMethod)) {
    return fail(
      "VALIDATION_ERROR",
      `waterBillingMethod không hợp lệ: "${input.waterBillingMethod}" (chỉ chấp nhận PER_CUBIC_METER hoặc PER_PERSON).`
    );
  }
  // Corrective: actualChargedAmount sẽ được lưu vào invoices
  // .actual_charged_amount NUMERIC(14, 2) — kiểm tra TRƯỚC bất kỳ
  // repository read/write nào rằng giá trị vừa scale 2 mà KHÔNG bị
  // PostgreSQL âm thầm làm tròn khi lưu (xem
  // invoice-input-validation.ts cho lý do đầy đủ). Dùng VALIDATION_ERROR
  // (không phải INVALID_ACTUAL_CHARGED_AMOUNT, vốn là mã lỗi của
  // calculateBillingDifference cho một tình huống khác — parse thất
  // bại/âm — xảy ra SAU bước đọc, không phải bước validate đầu vào này).
  if (input.actualChargedAmount !== null && !isValidActualChargedAmountScale(input.actualChargedAmount)) {
    return fail(
      "VALIDATION_ERROR",
      `actualChargedAmount không hợp lệ: "${input.actualChargedAmount}" (phải là chuỗi thập phân không âm, tối đa 12 chữ số nguyên và tối đa 2 chữ số thập phân, để lưu vừa NUMERIC(14, 2) mà không bị làm tròn).`
    );
  }

  return ok({
    electricityBillingMethod: input.electricityBillingMethod as ElectricityBillingMethod,
    waterBillingMethod: input.waterBillingMethod as WaterBillingMethod,
  });
}

export class CreateInvoiceService {
  constructor(private readonly deps: CreateInvoiceDependencies) {}

  async execute(input: CreateInvoiceInput): Promise<Result<CreateInvoiceResult>> {
    // 1. Kiểm tra input
    const validatedResult = validateCreateInvoiceInput(input);
    if (!validatedResult.success) {
      return validatedResult;
    }
    const { electricityBillingMethod, waterBillingMethod } = validatedResult.data;

    // ---- Giai đoạn đọc (fail-fast; không có bước ghi nào bên dưới chạy trước khi mọi bước đọc thành công) ----

    // 2. Đọc Room
    const roomResult = await this.deps.roomRepository.findById(input.roomId);
    if (!roomResult.success) {
      return roomResult;
    }
    const room = roomResult.data;

    // 3. Kiểm tra trùng lặp trước (pre-check). KHÔNG đủ một mình để
    // chặn race condition đồng thời — xem cách
    // PostgresInvoiceRepository.createInvoice xử lý SQLSTATE 23505 để
    // biết chốt chặn thật cho race condition.
    const existingInvoiceResult = await this.deps.invoiceRepository.findByRoomAndPeriod(input.roomId, input.billingPeriod);
    if (!existingInvoiceResult.success) {
      return existingInvoiceResult;
    }
    if (existingInvoiceResult.data !== null) {
      return fail(
        "INVOICE_ALREADY_EXISTS",
        `Invoice cho room ${input.roomId} kỳ ${input.billingPeriod.toISOString().slice(0, 10)} đã tồn tại.`
      );
    }

    // 4. Electricity MeterReading — luôn bắt buộc.
    const electricityReadingResult = await this.deps.meterReadingRepository.findByRoomPeriodAndUtility(
      input.roomId,
      input.billingPeriod,
      "ELECTRICITY"
    );
    if (!electricityReadingResult.success) {
      return electricityReadingResult;
    }
    const electricityReading = electricityReadingResult.data;

    // 5/6. Water MeterReading — chỉ bắt buộc với PER_CUBIC_METER; với
    // PER_PERSON hoàn toàn không cần tra reading nào (xem "Không chịu
    // trách nhiệm" ở đầu file).
    let waterReading: MeterReading | null = null;
    if (waterBillingMethod === "PER_CUBIC_METER") {
      const waterReadingResult = await this.deps.meterReadingRepository.findByRoomPeriodAndUtility(
        input.roomId,
        input.billingPeriod,
        "WATER"
      );
      if (!waterReadingResult.success) {
        return waterReadingResult;
      }
      waterReading = waterReadingResult.data;
    }

    // 7. ElectricityTariff đang có hiệu lực + các tier đã sắp xếp.
    const electricityTariffResult = await this.deps.electricityTariffRepository.findApplicableTariffForPeriod(
      input.billingPeriod
    );
    if (!electricityTariffResult.success) {
      return electricityTariffResult;
    }
    const { tariff: electricityTariff, tiers: electricityTiers } = electricityTariffResult.data;

    // 8. WaterTariff đang có hiệu lực.
    const waterTariffResult = await this.deps.waterTariffRepository.findApplicableTariffForPeriod(input.billingPeriod);
    if (!waterTariffResult.success) {
      return waterTariffResult;
    }
    const waterTariff = waterTariffResult.data;

    // ---- Giai đoạn tính toán (chỉ dùng Calculation Core; không còn lời gọi repository nào bên dưới) ----

    // 9. Sản lượng điện tiêu thụ — rollover được Calculation Core xử lý
    // hoàn toàn.
    const electricityUsageResult = calculateMeterUsage({
      previousReading: electricityReading.previousReading,
      currentReading: electricityReading.currentReading,
      meterMaximumValue: electricityReading.meterMaximumValue,
    });
    if (!electricityUsageResult.success) {
      return electricityUsageResult;
    }

    const tierInputs: ElectricityTierInput[] = electricityTiers.map((tier) => ({
      tierNumber: tier.tierNumber,
      thresholdKwh: tier.thresholdKwh,
      unitPrice: tier.unitPrice,
    }));

    // 10. Rẽ nhánh theo electricityBillingMethod — không có hằng số giá
    // nào ở đây, toàn bộ cấu hình lấy từ `electricityTariff`/`tierInputs`.
    let electricityData: TieredElectricityResult | FallbackElectricityResult;
    if (electricityBillingMethod === "QUOTA_TIERED") {
      const tieredResult = calculateTieredElectricity({
        usageKwh: electricityUsageResult.data,
        tenantCount: room.tenantCount,
        peoplePerQuotaUnit: electricityTariff.peoplePerQuotaUnit,
        vatRate: electricityTariff.electricityVatRate,
        tiers: tierInputs,
      });
      if (!tieredResult.success) {
        return tieredResult;
      }
      electricityData = tieredResult.data;
    } else {
      const fallbackResult = calculateFallbackElectricity({
        usageKwh: electricityUsageResult.data,
        vatRate: electricityTariff.electricityVatRate,
        tiers: tierInputs,
        fallbackTierNumber: electricityTariff.fallbackTierNumber,
      });
      if (!fallbackResult.success) {
        return fallbackResult;
      }
      electricityData = fallbackResult.data;
    }

    // 11. Sản lượng/tính toán tiền nước.
    let waterUsageM3: string | null = null;
    let waterQuantity: string;
    let waterUnitName: "m3" | "person";
    let waterUnitPrice: string;

    if (waterBillingMethod === "PER_CUBIC_METER") {
      if (waterReading === null) {
        // Không thể xảy ra theo cấu trúc if ở trên (bước 5/6) — kiểm
        // tra tường minh thay vì dùng type cast/non-null assertion, để
        // fail rõ ràng nếu bất biến này từng bị phá vỡ do sửa code sau
        // này.
        return fail("INTERNAL_INVARIANT_VIOLATION", "waterReading phải khác null khi waterBillingMethod = PER_CUBIC_METER.");
      }
      const waterUsageResult = calculateMeterUsage({
        previousReading: waterReading.previousReading,
        currentReading: waterReading.currentReading,
        meterMaximumValue: waterReading.meterMaximumValue,
      });
      if (!waterUsageResult.success) {
        return waterUsageResult;
      }
      waterUsageM3 = waterUsageResult.data;
      waterQuantity = waterUsageM3;
      waterUnitName = "m3";
      waterUnitPrice = waterTariff.pricePerCubicMeter;
    } else {
      // PER_PERSON: room.tenantCount đã là số nguyên đã validate ở tầng
      // domain (Room.tenantCount >= 0) — String() ở đây chỉ định dạng
      // hiển thị, không phải phép tính tài chính.
      waterQuantity = String(room.tenantCount);
      waterUnitName = "person";
      waterUnitPrice = waterTariff.pricePerPerson;
    }

    const waterResult = calculateWaterCharge({
      method: waterBillingMethod,
      waterUsageM3,
      tenantCount: room.tenantCount,
      pricePerCubicMeter: waterTariff.pricePerCubicMeter,
      pricePerPerson: waterTariff.pricePerPerson,
      vatRate: waterTariff.vatRate,
      environmentalFeeRate: waterTariff.environmentalFeeRate,
    });
    if (!waterResult.success) {
      return waterResult;
    }

    // 12. Tổng hoá đơn cuối cùng — cộng các thành phần CHÍNH XÁC trước,
    // làm tròn đúng một lần (KHÔNG BAO GIỜ cộng
    // electricity.roundedTotalVnd + water.roundedTotalVnd).
    const invoiceTotalResult = calculateInvoiceTotal({
      electricityExactTotal: electricityData.exactTotal,
      waterExactTotal: waterResult.data.exactTotal,
    });
    if (!invoiceTotalResult.success) {
      return invoiceTotalResult;
    }
    const invoiceTotal = invoiceTotalResult.data;

    // 13. Số tiền thực thu / chênh lệch hợp pháp-thực thu — chỉ tính ra,
    // không bao giờ được lưu trực tiếp.
    let billingDifference: string | null = null;
    if (input.actualChargedAmount !== null) {
      const billingDifferenceResult = calculateBillingDifference({
        actualChargedAmount: input.actualChargedAmount,
        legalRoundedTotalVnd: invoiceTotal.roundedTotalVnd,
      });
      if (!billingDifferenceResult.success) {
        return billingDifferenceResult;
      }
      billingDifference = billingDifferenceResult.data;
    }

    // 14. Dựng dữ liệu đầu vào để lưu invoice + invoice_items.
    const items = buildInvoiceItemBreakdown({
      electricityBillingMethod,
      electricity: electricityData,
      water: waterResult.data,
      waterQuantity,
      waterUnitName,
      waterUnitPrice,
    });

    const newInvoice: NewInvoice = {
      roomId: input.roomId,
      billingPeriod: input.billingPeriod,
      tenantCountUsed: room.tenantCount,
      electricityTariffId: electricityTariff.id,
      waterTariffId: waterTariff.id,
      electricityBillingMethod,
      waterBillingMethod,
      electricityReadingId: electricityReading.id,
      waterReadingId: waterReading !== null ? waterReading.id : null,
      calculatedTotal: invoiceTotal.roundedTotalVnd,
      actualChargedAmount: input.actualChargedAmount,
    };

    // ---- Giai đoạn ghi (transactional; NƠI DUY NHẤT có thao tác ghi) ----

    // 15-18. Insert invoice, rồi insert invoice_items, trong CÙNG MỘT
    // transaction. Một Result thất bại ở bước nào cũng rollback cả hai —
    // không có invoice tạo dở dang.
    const writeResult = await this.deps.invoiceUnitOfWork.run(async (invoiceRepository) => {
      const createdInvoiceResult = await invoiceRepository.createInvoice(newInvoice);
      if (!createdInvoiceResult.success) {
        return createdInvoiceResult;
      }

      const createdItemsResult = await invoiceRepository.createInvoiceItems(createdInvoiceResult.data.id, items);
      if (!createdItemsResult.success) {
        return createdItemsResult;
      }

      return ok({ invoice: createdInvoiceResult.data, items: createdItemsResult.data });
    });
    if (!writeResult.success) {
      return writeResult;
    }

    // 19. Trả về kết quả đã lưu + breakdown đã tính.
    return ok({
      invoice: writeResult.data.invoice,
      items: writeResult.data.items,
      electricity:
        electricityBillingMethod === "QUOTA_TIERED"
          ? { method: "QUOTA_TIERED" as const, result: electricityData as TieredElectricityResult }
          : { method: "FALLBACK_TIER_FLAT" as const, result: electricityData as FallbackElectricityResult },
      water: waterResult.data,
      invoiceTotal,
      billingDifference,
    });
  }
}

/** Xuất riêng để unit-test validate input mà không cần dựng toàn bộ Service. */
export const __testing = { validateCreateInvoiceInput };
