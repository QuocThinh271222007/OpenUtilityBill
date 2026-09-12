// SPDX-License-Identifier: MIT

import { Result } from "../shared/result";
import { WaterTariff } from "../modules/tariff/tariff.model";
import { TariffEffectivePeriod } from "./tariff-shared.types";

/** Dữ liệu ĐẦU VÀO — dùng cho cả create VÀ update (full replacement, một bảng đơn, không có aggregate con). */
export interface NewWaterTariff {
  name: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  pricePerCubicMeter: string;
  pricePerPerson: string;
  vatRate: string;
  environmentalFeeRate: string;
}

export type UpdateWaterTariff = NewWaterTariff;

/**
 * Trách nhiệm:
 * Hợp đồng cho việc tìm WaterTariff đang có hiệu lực tại một
 * billingPeriod (đọc, dùng bởi CreateInvoiceService — cùng lý do
 * `AMBIGUOUS_TARIFF_CONFIGURATION` như
 * `electricity-tariff.repository.ts`), VÀ (nay mở rộng cho Water Tariff
 * Management API) đọc/ghi đầy đủ.
 *
 * Khác với electricity_tariffs, `water_tariffs` là MỘT bảng đơn (không
 * có bảng con như tiers) — `create`/`update` không cần Unit of Work
 * riêng, một câu `INSERT`/`UPDATE` đã tự nguyên tử.
 *
 * Điều kiện lỗi:
 * - `TARIFF_NOT_FOUND` / `AMBIGUOUS_TARIFF_CONFIGURATION` (đọc theo
 *   billingPeriod).
 * - `create`: `TARIFF_ALREADY_EXISTS` khi vi phạm `UNIQUE(name,
 *   effective_from)`.
 * - `update`/`deleteById`: `TARIFF_NOT_FOUND` khi id không tồn tại.
 * - `deleteById`: `TARIFF_IN_USE` khi vi phạm
 *   `invoices.water_tariff_id ON DELETE RESTRICT` (xem migration 001) —
 *   PostgreSQL là nguồn thẩm quyền cuối cùng.
 * - `DATABASE_READ_FAILED`/`DATABASE_WRITE_FAILED` cho lỗi khác.
 */
export interface WaterTariffRepository {
  findApplicableTariffForPeriod(billingPeriod: Date): Promise<Result<WaterTariff>>;

  /** `ORDER BY effective_from DESC, id DESC`. */
  listAll(): Promise<Result<WaterTariff[]>>;

  listEffectivePeriods(): Promise<Result<TariffEffectivePeriod[]>>;

  isReferencedByInvoice(tariffId: string): Promise<Result<boolean>>;

  create(input: NewWaterTariff): Promise<Result<WaterTariff>>;

  update(id: string, input: UpdateWaterTariff): Promise<Result<WaterTariff>>;

  /** Xoá đúng MỘT water tariff theo id. Trả về `{ id }` của hàng đã xoá. */
  deleteById(id: string): Promise<Result<{ id: string }>>;
}
