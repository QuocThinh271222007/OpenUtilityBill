// SPDX-License-Identifier: MIT

import { RentalProperty } from "./property.model";

/**
 * Responsibility:
 * Tiện ích ranh giới HTTP CHỈ cho module property — chuyển
 * `RentalProperty` thành JSON an toàn cho response. Việc parse ngày
 * (không có field ngày nào trong request property) và ánh xạ error code
 * dùng trực tiếp `backend/src/shared/http/` — không cần lặp lại ở đây.
 *
 * Does NOT:
 * - import Express `Request`/`Response`.
 * - chứa business logic.
 */
export function serializeProperty(property: RentalProperty) {
  return {
    id: property.id,
    name: property.name,
    address: property.address,
    createdAt: property.createdAt.toISOString(),
  };
}
