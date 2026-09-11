// SPDX-License-Identifier: MIT

import { Result, ok, fail } from "../../shared/result";
import { isPositiveIntegerId } from "../../shared/validation/id";
import { RentalProperty } from "./property.model";
import { NewRentalProperty, UpdateRentalProperty } from "../../repositories/property.repository";
import { CreatePropertyInput, PropertyManagementDependencies, UpdatePropertyInput } from "./property-management.types";

/**
 * Responsibility:
 * Business validation + orchestration cho quản lý `RentalProperty` —
 * `list`/`create`/`update`. Đây là Service đầu tiên KHÔNG có bước tính
 * toán tài chính nào (property không có field NUMERIC) — chỉ validate
 * hình dạng/nội dung input rồi gọi Repository.
 *
 * Failure conditions:
 * - `create`/`update`: `VALIDATION_ERROR` khi `name` rỗng sau khi trim,
 *   hoặc PATCH không có field nào.
 * - `update`: `VALIDATION_ERROR` khi `id` không đúng hình dạng BIGINT;
 *   `PROPERTY_NOT_FOUND` propagate từ Repository khi không có property.
 *
 * Important invariant:
 * `name` luôn được trim TRƯỚC khi lưu; `address` cũng được trim, và một
 * chuỗi rỗng sau khi trim CHUẨN HOÁ thành `null` (một địa chỉ rỗng
 * không có ý nghĩa khác `null`) — xem "Why" ở `normalizeAddress` bên
 * dưới.
 *
 * Does NOT:
 * - chứa SQL/Postgres.js import — chỉ phụ thuộc `PropertyRepository`
 *   interface.
 * - implement `delete` — xem docs/MANAGEMENT_API.md.
 */

/** `name` phải KHÔNG RỖNG sau khi trim — một property không tên không có ý nghĩa nghiệp vụ. */
function normalizeName(name: string): Result<string> {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return fail("VALIDATION_ERROR", "name không được rỗng.");
  }
  return ok(trimmed);
}

/**
 * `address` là optional theo schema (`TEXT`, không `NOT NULL`). Một
 * chuỗi rỗng ("", "   ") sau khi trim KHÔNG có ý nghĩa khác một địa chỉ
 * không được cung cấp — chuẩn hoá thành `null` để tránh hai cách biểu
 * diễn "không có địa chỉ" (chuỗi rỗng VÀ null) tồn tại song song trong
 * dữ liệu.
 */
function normalizeAddress(address: string | null): string | null {
  if (address === null) {
    return null;
  }
  const trimmed = address.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export class PropertyManagementService {
  constructor(private readonly deps: PropertyManagementDependencies) {}

  async list(): Promise<Result<RentalProperty[]>> {
    return this.deps.propertyRepository.listAll();
  }

  async create(input: CreatePropertyInput): Promise<Result<RentalProperty>> {
    const nameResult = normalizeName(input.name);
    if (!nameResult.success) {
      return nameResult;
    }

    const newProperty: NewRentalProperty = {
      name: nameResult.data,
      address: normalizeAddress(input.address),
    };
    return this.deps.propertyRepository.create(newProperty);
  }

  async update(id: string, input: UpdatePropertyInput): Promise<Result<RentalProperty>> {
    if (!isPositiveIntegerId(id)) {
      return fail("VALIDATION_ERROR", `propertyId không hợp lệ (phải là chuỗi số nguyên dương): "${id}".`);
    }
    if (input.name === undefined && input.address === undefined) {
      return fail("VALIDATION_ERROR", "PATCH phải cung cấp ít nhất một field (name hoặc address).");
    }

    const update: UpdateRentalProperty = {};
    if (input.name !== undefined) {
      const nameResult = normalizeName(input.name);
      if (!nameResult.success) {
        return nameResult;
      }
      update.name = nameResult.data;
    }
    if (input.address !== undefined) {
      update.address = normalizeAddress(input.address);
    }

    return this.deps.propertyRepository.update(id, update);
  }
}
