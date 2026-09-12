// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../shared/result";
import { isPositiveIntegerId } from "../../shared/validation/id";
import { isFirstDayOfMonthUtc } from "../../shared/validation/date";
import { isExactDecimalWithinScale } from "../../shared/validation/decimal-scale";
import { calculateMeterUsage } from "../../calculation/meter/calculate-meter-usage";
import { MeterReading, UtilityType } from "./meter-reading.model";
import { NewMeterReading } from "../../repositories/meter-reading.repository";
import { CreateMeterReadingInput, MeterReadingManagementDependencies, UpdateMeterReadingInput } from "./meter-reading-management.types";

/**
 * Trách nhiệm:
 * Business validation + orchestration cho quản lý `MeterReading` —
 * `list`/`create`/`update`.
 *
 * Điều kiện lỗi:
 * - `VALIDATION_ERROR`: hình dạng sai (roomId, billingPeriod,
 *   utilityType, hoặc chuỗi thập phân không vừa `NUMERIC(12, 2)`).
 * - `INVALID_METER_READING`/`INVALID_METER_MAXIMUM`/
 *   `METER_MAXIMUM_REQUIRED`: propagate từ Calculation Core
 *   (`calculateMeterUsage`) khi tổ hợp previous/current/max không hợp
 *   lệ về mặt NGHIỆP VỤ (âm, vượt max, rollover không có max, ...).
 * - `create`/`update`: `METER_READING_ALREADY_EXISTS` propagate từ
 *   Repository khi vi phạm `UNIQUE(room_id, billing_period,
 *   utility_type)`.
 * - `update`/`delete`: `METER_READING_IN_USE` khi reading đã được một
 *   invoice tham chiếu — xem "Bảo vệ tham chiếu lịch sử" bên dưới.
 *
 * Important invariant — TÁI SỬ DỤNG Calculation Core, không tự viết lại
 * kiểm tra rollover:
 * Sau bước kiểm tra HÌNH DẠNG (shape) chuỗi thập phân, Service gọi
 * `calculateMeterUsage(...)` — hàm DUY NHẤT trong dự án biết cách kiểm
 * tra một tổ hợp (previous, current, max) có hợp lệ để tính hoá đơn hay
 * không (không âm, max dương, previous/current <= max, rollover khi
 * current < previous VÀ có max, từ chối rõ ràng khi current < previous
 * mà KHÔNG có max). Kết quả `usage` bị BỎ QUA ở đây — Service này chỉ
 * cần biết tổ hợp có HỢP LỆ hay không, không cần giá trị usage (đó là
 * việc của CreateInvoiceService khi thực sự tính hoá đơn).
 *
 * Bảo vệ tham chiếu lịch sử (update):
 * TRƯỚC khi ghi `update`, Service kiểm tra
 * `meterReadingRepository.isReferencedByInvoice(id)` — nếu MỘT invoice
 * đã dùng reading này (`electricity_reading_id` hoặc `water_reading_id`),
 * từ chối với `METER_READING_IN_USE`. Sửa số liệu công tơ NGUỒN của một
 * hoá đơn đã tạo sẽ khiến bằng chứng lịch sử của hoá đơn đó không còn
 * khớp với dữ liệu gốc — xem docs/MANAGEMENT_API.md.
 *
 * Không chịu trách nhiệm:
 * - chứa SQL/Postgres.js import.
 */
const UTILITY_TYPES: ReadonlySet<string> = new Set<UtilityType>(["ELECTRICITY", "WATER"]);

/** `NUMERIC(12, 2)`: tối đa 10 chữ số nguyên, 2 chữ số thập phân — xem docs/MANAGEMENT_API.md mục "Hợp đồng số (`NUMERIC(12, 2)`)". */
function isValidMeterDecimalShape(value: string): boolean {
  return isExactDecimalWithinScale(value, { maxIntegerDigits: 10, maxFractionalDigits: 2 });
}

interface ValidatedMeterReadingInput {
  roomId: string;
  billingPeriod: Date;
  utilityType: UtilityType;
  previousReading: string;
  currentReading: string;
  meterMaximumValue: string | null;
}

function validateShape(input: CreateMeterReadingInput | UpdateMeterReadingInput): Result<ValidatedMeterReadingInput> {
  if (!isPositiveIntegerId(input.roomId)) {
    return fail("VALIDATION_ERROR", `roomId không hợp lệ (phải là chuỗi số nguyên dương): "${input.roomId}".`);
  }
  if (!isFirstDayOfMonthUtc(input.billingPeriod)) {
    return fail("VALIDATION_ERROR", "billingPeriod phải là một ngày hợp lệ và là ngày đầu tiên của tháng (UTC).");
  }
  if (!UTILITY_TYPES.has(input.utilityType)) {
    return fail("VALIDATION_ERROR", `utilityType không hợp lệ: "${input.utilityType}" (chỉ chấp nhận ELECTRICITY hoặc WATER).`);
  }
  if (!isValidMeterDecimalShape(input.previousReading)) {
    return fail(
      "VALIDATION_ERROR",
      `previousReading không hợp lệ: "${input.previousReading}" (phải là chuỗi thập phân không âm, tối đa 10 chữ số nguyên và 2 chữ số thập phân).`
    );
  }
  if (!isValidMeterDecimalShape(input.currentReading)) {
    return fail(
      "VALIDATION_ERROR",
      `currentReading không hợp lệ: "${input.currentReading}" (phải là chuỗi thập phân không âm, tối đa 10 chữ số nguyên và 2 chữ số thập phân).`
    );
  }
  if (input.meterMaximumValue !== null && !isValidMeterDecimalShape(input.meterMaximumValue)) {
    return fail(
      "VALIDATION_ERROR",
      `meterMaximumValue không hợp lệ: "${input.meterMaximumValue}" (phải là null hoặc chuỗi thập phân không âm, tối đa 10 chữ số nguyên và 2 chữ số thập phân).`
    );
  }

  return ok({
    roomId: input.roomId,
    billingPeriod: input.billingPeriod,
    utilityType: input.utilityType as UtilityType,
    previousReading: input.previousReading,
    currentReading: input.currentReading,
    meterMaximumValue: input.meterMaximumValue,
  });
}

export class MeterReadingManagementService {
  constructor(private readonly deps: MeterReadingManagementDependencies) {}

  async list(roomId: string, billingPeriod?: Date): Promise<Result<MeterReading[]>> {
    if (!isPositiveIntegerId(roomId)) {
      return fail("VALIDATION_ERROR", `roomId không hợp lệ (phải là chuỗi số nguyên dương): "${roomId}".`);
    }
    if (billingPeriod !== undefined && !isFirstDayOfMonthUtc(billingPeriod)) {
      return fail("VALIDATION_ERROR", "billingPeriod phải là một ngày hợp lệ và là ngày đầu tiên của tháng (UTC).");
    }
    return this.deps.meterReadingRepository.listByRoom(roomId, billingPeriod);
  }

  async create(input: CreateMeterReadingInput): Promise<Result<MeterReading>> {
    const shapeResult = validateShape(input);
    if (!shapeResult.success) {
      return shapeResult;
    }
    const validated = shapeResult.data;

    // Bỏ qua giá trị usage trả về — chỉ cần biết tổ hợp có hợp lệ hay không.
    const usageResult = calculateMeterUsage({
      previousReading: validated.previousReading,
      currentReading: validated.currentReading,
      meterMaximumValue: validated.meterMaximumValue,
    });
    if (!usageResult.success) {
      return usageResult;
    }

    const newReading: NewMeterReading = {
      roomId: validated.roomId,
      billingPeriod: validated.billingPeriod,
      utilityType: validated.utilityType,
      previousReading: validated.previousReading,
      currentReading: validated.currentReading,
      meterMaximumValue: validated.meterMaximumValue,
    };
    return this.deps.meterReadingRepository.create(newReading);
  }

  async update(id: string, input: UpdateMeterReadingInput): Promise<Result<MeterReading>> {
    if (!isPositiveIntegerId(id)) {
      return fail("VALIDATION_ERROR", `readingId không hợp lệ (phải là chuỗi số nguyên dương): "${id}".`);
    }

    const shapeResult = validateShape(input);
    if (!shapeResult.success) {
      return shapeResult;
    }
    const validated = shapeResult.data;

    const usageResult = calculateMeterUsage({
      previousReading: validated.previousReading,
      currentReading: validated.currentReading,
      meterMaximumValue: validated.meterMaximumValue,
    });
    if (!usageResult.success) {
      return usageResult;
    }

    const referencedResult = await this.deps.meterReadingRepository.isReferencedByInvoice(id);
    if (!referencedResult.success) {
      return referencedResult;
    }
    if (referencedResult.data) {
      return fail("METER_READING_IN_USE", `Meter reading với id = ${id} đã được một invoice tham chiếu, không thể sửa.`);
    }

    return this.deps.meterReadingRepository.update(id, {
      roomId: validated.roomId,
      billingPeriod: validated.billingPeriod,
      utilityType: validated.utilityType,
      previousReading: validated.previousReading,
      currentReading: validated.currentReading,
      meterMaximumValue: validated.meterMaximumValue,
    });
  }

  /**
   * Xoá đúng MỘT meter reading — CHỈ được phép khi CHƯA từng được một
   * invoice tham chiếu (cùng bất biến với `update`, xem "Bảo vệ tham
   * chiếu lịch sử" ở trên). Pre-check bằng `isReferencedByInvoice` cho
   * message rõ ràng; FK constraint (`ON DELETE RESTRICT`) vẫn là nguồn
   * thẩm quyền cuối cùng cho race condition.
   */
  async delete(id: string): Promise<Result<{ id: string }>> {
    if (!isPositiveIntegerId(id)) {
      return fail("VALIDATION_ERROR", `readingId không hợp lệ (phải là chuỗi số nguyên dương): "${id}".`);
    }

    const referencedResult = await this.deps.meterReadingRepository.isReferencedByInvoice(id);
    if (!referencedResult.success) {
      return referencedResult;
    }
    if (referencedResult.data) {
      return fail("METER_READING_IN_USE", `Meter reading với id = ${id} đã được một invoice tham chiếu, không thể xoá.`);
    }

    return this.deps.meterReadingRepository.deleteById(id);
  }
}
