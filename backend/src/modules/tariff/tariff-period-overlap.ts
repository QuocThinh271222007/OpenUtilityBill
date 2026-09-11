// SPDX-License-Identifier: MIT

/**
 * Responsibility:
 * Kiểm tra hai khoảng hiệu lực (`effectiveFrom`/`effectiveTo`, `null`
 * `effectiveTo` = không giới hạn tương lai) có CHỒNG LẤN hay không —
 * DÙNG CHUNG giữa `ElectricityTariffManagementService` và
 * `WaterTariffManagementService` (hai bảng độc lập, cùng quy tắc).
 *
 * Definition:
 *   A bắt đầu trước/bằng lúc B kết thúc
 *   VÀ
 *   B bắt đầu trước/bằng lúc A kết thúc
 *
 * Why this exists (application-level, không phải exclusion constraint):
 * Schema hiện tại (migration 001) KHÔNG có ràng buộc loại trừ
 * (`EXCLUDE` constraint) cho khoảng effective_from/effective_to — thêm
 * một ràng buộc như vậy cần một migration mới, ngoài phạm vi task này
 * (xem docs/MANAGEMENT_API.md mục "Tariff overlap validation"). Đây là
 * lớp kiểm tra Ở TẦNG QUẢN TRỊ (admin-level conflict prevention) —
 * CreateInvoiceService vẫn giữ nguyên `AMBIGUOUS_TARIFF_CONFIGURATION`
 * làm PHÒNG TUYẾN THỨ HAI độc lập, fail-closed nếu dữ liệu (được tạo từ
 * trước khi có kiểm tra này, hoặc chèn trực tiếp qua SQL) vẫn rơi vào
 * tình huống mơ hồ.
 *
 * Does NOT:
 * - dùng SERIALIZABLE isolation hay advisory lock để chặn race
 *   condition giữa lúc kiểm tra và lúc ghi — task này KHÔNG giới thiệu
 *   cơ chế concurrency mới; kiểm tra chồng lấn là một tiện ích quản trị
 *   (admin convenience), không phải một ràng buộc toàn vẹn dữ liệu được
 *   đảm bảo tuyệt đối bởi database.
 */
export interface EffectivePeriod {
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

export function periodsOverlap(a: EffectivePeriod, b: EffectivePeriod): boolean {
  const aStartsBeforeOrAtBEnd = b.effectiveTo === null || a.effectiveFrom.getTime() <= b.effectiveTo.getTime();
  const bStartsBeforeOrAtAEnd = a.effectiveTo === null || b.effectiveFrom.getTime() <= a.effectiveTo.getTime();
  return aStartsBeforeOrAtBEnd && bStartsBeforeOrAtAEnd;
}
