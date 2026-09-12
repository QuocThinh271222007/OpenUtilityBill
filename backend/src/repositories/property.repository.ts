// SPDX-License-Identifier: MIT

import { Result } from "../shared/result";
import { RentalProperty } from "../modules/property/property.model";

/**
 * Trách nhiệm:
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
 * Trách nhiệm:
 * Hợp đồng đọc/ghi cho `RentalProperty` — được deferred từ task nền
 * tảng database trước đó (không có use case đọc nào cần), nay được
 * implement đầy đủ cho Property Management API
 * (`docs/MANAGEMENT_API.md`).
 *
 * Điều kiện lỗi:
 * - `findById`/`update`/`deleteById`: `PROPERTY_NOT_FOUND` khi không có
 *   property nào khớp id.
 * - `deleteById`: `PROPERTY_HAS_DEPENDENCIES` khi vẫn còn Room tham
 *   chiếu property này (`rooms.property_id ON DELETE RESTRICT`, xem
 *   migration 001) — PostgreSQL là nguồn thẩm quyền cuối cùng, không
 *   phải một pre-check SELECT ở tầng ứng dụng.
 * - `DATABASE_READ_FAILED`/`DATABASE_WRITE_FAILED` cho lỗi query/ghi
 *   khác.
 */
export interface PropertyRepository {
  /** `ORDER BY id ASC` — thứ tự xác định (deterministic), không dựa vào thứ tự hàng tự nhiên. */
  listAll(): Promise<Result<RentalProperty[]>>;
  findById(id: string): Promise<Result<RentalProperty>>;
  create(input: NewRentalProperty): Promise<Result<RentalProperty>>;
  update(id: string, input: UpdateRentalProperty): Promise<Result<RentalProperty>>;
  /** Xoá đúng MỘT property theo id — KHÔNG cascade xoá room. Trả về `{ id }` của hàng đã xoá. */
  deleteById(id: string): Promise<Result<{ id: string }>>;
}
