// SPDX-License-Identifier: MIT

/**
 * Responsibility:
 * Type mô tả `Room` và các body ghi dữ liệu — khớp
 * docs/MANAGEMENT_API.md mục "Rooms".
 *
 * Important invariant:
 * `tenantCount` là số nguyên đếm được (backend cột INTEGER, không phải
 * NUMERIC tài chính) — ĐÂY LÀ TRƯỜNG HỢP DUY NHẤT được phép dùng kiểu
 * `number` cho một giá trị nhập từ form, khác với mọi chỉ số công tơ/
 * đơn giá/tỉ lệ (luôn là `string`) — xem docs/FRONTEND.md mục "Integer
 * vs. financial decimal fields".
 *
 * `propertyId` KHÔNG xuất hiện trong `UpdateRoomBody` — immutable trên
 * PATCH (khớp backend `UpdateRoom`, xem
 * docs/MANAGEMENT_API.md mục "PATCH /api/v1/rooms/:roomId").
 */
export interface Room {
  id: string;
  propertyId: string;
  name: string;
  tenantCount: number;
  createdAt: string;
}

export interface CreateRoomBody {
  propertyId: string;
  name: string;
  tenantCount: number;
}

export interface UpdateRoomBody {
  name?: string;
  tenantCount?: number;
}
