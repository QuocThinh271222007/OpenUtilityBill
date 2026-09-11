// SPDX-License-Identifier: MIT

/**
 * Responsibility:
 * Domain types mô tả cấu hình biểu giá điện và nước: ElectricityTariff,
 * ElectricityTariffTier, WaterTariff. Đây là DỮ LIỆU CẤU HÌNH
 * (configuration), KHÔNG phải công thức tính toán.
 *
 * Represents:
 * Dữ liệu tương ứng với các bảng `electricity_tariffs`,
 * `electricity_tariff_tiers`, `water_tariffs`.
 *
 * Invariants (enforce ở tầng database, xem migration):
 * - Một ElectricityTariff có N ElectricityTariffTier, duy nhất theo
 *   (tariffId, tierNumber).
 * - `thresholdKwh` dương cho bậc có giới hạn; NULL cho bậc cuối cùng
 *   (nghĩa là "phần sản lượng còn lại, không giới hạn").
 * - `effectiveTo >= effectiveFrom` khi `effectiveTo` có giá trị.
 * - `electricityVatRate`, `vatRate`, `environmentalFeeRate` là PHÂN SỐ
 *   THẬP PHÂN trong đoạn [0, 1] (ví dụ 8% = "0.08"), KHÔNG phải số
 *   nguyên phần trăm ("8"). `pricePerCubicMeter`/`pricePerPerson`
 *   KHÔNG theo quy ước này — đó là đơn giá tiền, không có giới hạn trên
 *   tự nhiên (xem docs/DATABASE_DESIGN.md).
 *
 * ID representation:
 * `id`, `tariffId` là `string` (BIGINT ở database) — xem
 * ../property/property.model.ts mục "ID representation" và
 * docs/DATABASE_ACCESS.md.
 *
 * Numeric representation:
 * `electricityVatRate`, `unitPrice`, `thresholdKwh`, `pricePerCubicMeter`,
 * `pricePerPerson`, `vatRate`, `environmentalFeeRate` đều là `string`,
 * vì cột database tương ứng là NUMERIC — cùng quy ước với
 * ../meter-reading/meter-reading.model.ts (xem comment ở đó và
 * docs/DATABASE_DESIGN.md). `peoplePerQuotaUnit`, `fallbackTierNumber`,
 * `tierNumber` là số nguyên đếm được (count), không phải giá trị tài
 * chính/đo lường cần độ chính xác thập phân, nên giữ kiểu `number`.
 *
 * Does NOT:
 * - implement công thức phân bổ bậc thang (tier allocation) hay tính
 *   VAT/phí — đó là việc của Calculation Core (task sau). File này CHỈ
 *   mô tả hình dạng dữ liệu cấu hình.
 * - hard-code số lượng bậc. Số bậc là DATA-DRIVEN: một ElectricityTariff
 *   có thể có bất kỳ số ElectricityTariffTier nào (mặc định kỳ thi hiện
 *   tại là 6, nhưng đây không phải giới hạn cố định trong code hay
 *   schema).
 * - có Repository/Service/Controller đi kèm ở task này.
 *
 * Why ElectricityTariff and ElectricityTariffTier are separate models:
 * Nếu dùng các cột `tier1_price`, `tier2_price`, ..., số bậc sẽ bị cố
 * định cứng trong schema — muốn đổi số bậc phải ALTER TABLE. Tách
 * ElectricityTariffTier thành bảng riêng (một hàng = một bậc) cho phép
 * số bậc thay đổi hoàn toàn bằng dữ liệu (INSERT/DELETE một hàng),
 * không cần sửa code hay schema.
 *
 * Why ElectricityTariff.peoplePerQuotaUnit và .fallbackTierNumber tồn tại:
 * Quy tắc "số người / 4 = số định mức" và "phương pháp fallback dùng giá
 * bậc 3" là quy định của kỳ thi HIỆN TẠI, không phải hằng số vĩnh viễn
 * của chương trình. Lưu chúng như cấu hình cho phép thay đổi mà không
 * cần sửa Calculation Core sau này (xem docs/DATABASE_DESIGN.md).
 *
 * Why WaterTariff gộp cả hai phương pháp trong một bảng:
 * PER_CUBIC_METER và PER_PERSON là hai cách tính giá nước của CÙNG một
 * phiên bản cấu hình (cùng effectiveFrom/effectiveTo, cùng VAT, cùng
 * phí môi trường) — không phải hai hệ thống độc lập, nên gộp trong một
 * bảng thay vì tạo hai bảng nước riêng biệt.
 */

export type ElectricityBillingMethod = "QUOTA_TIERED" | "FALLBACK_TIER_FLAT";

export type WaterBillingMethod = "PER_CUBIC_METER" | "PER_PERSON";

export interface ElectricityTariff {
  id: string;
  name: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  electricityVatRate: string;
  peoplePerQuotaUnit: number;
  fallbackTierNumber: number;
  createdAt: Date;
}

export interface ElectricityTariffTier {
  id: string;
  tariffId: string;
  tierNumber: number;
  thresholdKwh: string | null;
  unitPrice: string;
}

export interface WaterTariff {
  id: string;
  name: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  pricePerCubicMeter: string;
  pricePerPerson: string;
  vatRate: string;
  environmentalFeeRate: string;
  createdAt: Date;
}
