// SPDX-License-Identifier: MIT

/**
 * Responsibility:
 * Type mô tả `RentalProperty` và các body ghi dữ liệu — khớp CHÍNH XÁC
 * hợp đồng HTTP mô tả ở docs/MANAGEMENT_API.md mục "Properties".
 *
 * Important invariant:
 * `id` là chuỗi (BIGINT ở backend), KHÔNG BAO GIỜ là `number` — xem
 * docs/API.md mục "Conventions used throughout".
 *
 * Does NOT: validate dữ liệu tại runtime.
 */
export interface RentalProperty {
  id: string;
  name: string;
  address: string | null;
  createdAt: string;
}

export interface CreatePropertyBody {
  name: string;
  address: string | null;
}

/** PATCH — field vắng mặt nghĩa là "không đổi"; ít nhất một field phải có mặt (backend validate). */
export interface UpdatePropertyBody {
  name?: string;
  address?: string | null;
}
