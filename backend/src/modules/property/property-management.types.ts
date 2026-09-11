// SPDX-License-Identifier: MIT

import { PropertyRepository } from "../../repositories/property.repository";

/**
 * Responsibility:
 * Type dùng chung của `PropertyManagementService` — tách khỏi
 * `property-management.service.ts` cùng lý do với
 * `create-invoice.types.ts`.
 */

/** POST — cả hai field luôn bắt buộc trong request (address có thể là `null`). */
export interface CreatePropertyInput {
  name: string;
  address: string | null;
}

/** PATCH — field vắng mặt (`undefined`) nghĩa là "không đổi"; ít nhất một field phải có mặt. */
export interface UpdatePropertyInput {
  name?: string;
  address?: string | null;
}

export interface PropertyManagementDependencies {
  propertyRepository: PropertyRepository;
}
