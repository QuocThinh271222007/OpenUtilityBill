// SPDX-License-Identifier: MIT

import { Result } from "../shared/result";
import { RentalProperty } from "../modules/property/property.model";

/**
 * Responsibility:
 * Dữ liệu ĐẦU VÀO để tạo/sửa một RentalProperty — type riêng (không
 * `Omit<RentalProperty, ...>`/`Partial<RentalProperty>`), cùng lý do với
 * `NewInvoice`/`NewInvoiceItem` (xem `invoice.repository.ts`).
 *
 * `UpdateRentalProperty` cho phép TỪNG field là optional (PATCH — chỉ
 * cập nhật field được cung cấp), khác `NewRentalProperty` (POST — cả
 * hai field luôn bắt buộc).
 */
export interface NewRentalProperty {
  name: string;
  address: string | null;
}

export interface UpdateRentalProperty {
  name?: string;
  address?: string | null;
}

/**
 * Responsibility:
 * Hợp đồng đọc/ghi cho `RentalProperty` — được deferred từ task nền
 * tảng database trước đó (không có use case đọc nào cần), nay được
 * implement đầy đủ cho Property Management API
 * (`docs/MANAGEMENT_API.md`).
 *
 * Failure conditions:
 * - `findById`/`update`: `PROPERTY_NOT_FOUND` khi không có property nào
 *   khớp id.
 * - `DATABASE_READ_FAILED`/`DATABASE_WRITE_FAILED` cho lỗi query/ghi
 *   khác.
 *
 * Does NOT:
 * - implement `delete` — xem docs/MANAGEMENT_API.md mục "No DELETE
 *   endpoints (by design)".
 */
export interface PropertyRepository {
  /** `ORDER BY id ASC` — thứ tự xác định (deterministic), không dựa vào thứ tự hàng tự nhiên. */
  listAll(): Promise<Result<RentalProperty[]>>;
  findById(id: string): Promise<Result<RentalProperty>>;
  create(input: NewRentalProperty): Promise<Result<RentalProperty>>;
  update(id: string, input: UpdateRentalProperty): Promise<Result<RentalProperty>>;
}
