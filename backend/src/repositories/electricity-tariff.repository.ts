// SPDX-License-Identifier: MIT

import { Result } from "../shared/result";
import { ElectricityTariff, ElectricityTariffTier } from "../modules/tariff/tariff.model";
import { TariffEffectivePeriod } from "./tariff-shared.types";

/**
 * Một ElectricityTariff cùng các bậc giá của nó, đã sắp xếp theo
 * `tierNumber` tăng dần (ORDER BY tier_number ASC — xem
 * docs/DATABASE_ACCESS.md mục "Electricity tier ordering"). Không dựa
 * vào thứ tự hàng tự nhiên của PostgreSQL.
 */
export interface ElectricityTariffWithTiers {
  tariff: ElectricityTariff;
  tiers: ElectricityTariffTier[];
}

/** Dữ liệu ĐẦU VÀO cho phần "cha" (electricity_tariffs) — dùng cho cả create VÀ update (full replacement, xem docs/MANAGEMENT_API.md). */
export interface NewElectricityTariff {
  name: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  electricityVatRate: string;
  peoplePerQuotaUnit: number;
  fallbackTierNumber: number;
}

export type UpdateElectricityTariffParent = NewElectricityTariff;

/** Dữ liệu ĐẦU VÀO cho một bậc giá — không có `id`/`tariffId` (`replaceTiers` nhận `tariffId` làm tham số riêng). */
export interface NewElectricityTariffTier {
  tierNumber: number;
  thresholdKwh: string | null;
  unitPrice: string;
}

export type { TariffEffectivePeriod };

/**
 * Trách nhiệm:
 * Hợp đồng cho việc tìm ElectricityTariff ĐANG CÓ HIỆU LỰC tại một
 * billingPeriod cụ thể (đọc, dùng bởi CreateInvoiceService), VÀ (nay mở
 * rộng cho Electricity Tariff Management API) đọc/ghi đầy đủ — list tất
 * cả phiên bản, tạo/thay thế parent + tiers, kiểm tra chồng lấn/tham
 * chiếu lịch sử.
 *
 * "Đang có hiệu lực" nghĩa là:
 *   effective_from <= billingPeriod
 *   AND (effective_to IS NULL OR effective_to >= billingPeriod)
 *
 * Điều kiện lỗi:
 * - `findApplicableTariffForPeriod`: `TARIFF_NOT_FOUND` khi không có
 *   tariff nào khớp điều kiện hiệu lực;
 *   `AMBIGUOUS_TARIFF_CONFIGURATION` khi CÓ NHIỀU HƠN MỘT tariff cùng
 *   khớp — implementation KHÔNG được tự ý chọn đại một hàng (xem
 *   docs/DATABASE_DESIGN.md mục "Tariff versions and effective dates").
 *   Đây là PHÒNG TUYẾN THỨ HAI độc lập với kiểm tra chồng lấn ở tầng
 *   Service quản trị (`TARIFF_PERIOD_OVERLAP`, xem
 *   docs/MANAGEMENT_API.md) — CreateInvoice vẫn từ chối fail-closed nếu
 *   dữ liệu tariff hiện có (được tạo TRƯỚC khi có kiểm tra chồng lấn,
 *   hoặc chèn trực tiếp qua SQL) rơi vào tình huống mơ hồ.
 * - `createTariff`: `TARIFF_ALREADY_EXISTS` khi vi phạm
 *   `UNIQUE(name, effective_from)`.
 * - `updateTariffParent`: `TARIFF_NOT_FOUND` khi id không tồn tại.
 * - `DATABASE_READ_FAILED`/`DATABASE_WRITE_FAILED` cho lỗi khác.
 *
 * Bất biến quan trọng:
 * `createTariff`/`replaceTiers`/`updateTariffParent` KHÔNG tự mở
 * transaction — chạy bằng `DatabaseExecutor` được truyền vào constructor
 * của implementation, để parent + tiers nằm chung MỘT transaction do
 * caller (`ElectricityTariffUnitOfWork`) kiểm soát.
 *
 * Không chịu trách nhiệm:
 * - hard-code số lượng bậc hay bất kỳ hằng số biểu giá cụ thể nào.
 * - implement `delete`.
 */
export interface ElectricityTariffRepository {
  findApplicableTariffForPeriod(billingPeriod: Date): Promise<Result<ElectricityTariffWithTiers>>;

  /** `ORDER BY effective_from DESC, id DESC`; tiers mỗi tariff `ORDER BY tier_number ASC`. */
  listAll(): Promise<Result<ElectricityTariffWithTiers[]>>;

  /** Dùng cho kiểm tra chồng lấn khoảng hiệu lực ở Service — không tải tiers. */
  listEffectivePeriods(): Promise<Result<TariffEffectivePeriod[]>>;

  /** `true` khi tariff này được một invoice tham chiếu (`electricity_tariff_id`). */
  isReferencedByInvoice(tariffId: string): Promise<Result<boolean>>;

  createTariff(input: NewElectricityTariff): Promise<Result<ElectricityTariff>>;

  /** Xoá TOÀN BỘ tier cũ của `tariffId` rồi chèn `tiers` — gọi bên trong transaction, xem "Bất biến quan trọng". */
  replaceTiers(tariffId: string, tiers: NewElectricityTariffTier[]): Promise<Result<ElectricityTariffTier[]>>;

  updateTariffParent(id: string, input: UpdateElectricityTariffParent): Promise<Result<ElectricityTariff>>;
}
