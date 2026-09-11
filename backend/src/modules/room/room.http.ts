// SPDX-License-Identifier: MIT

import { Room } from "./room.model";

/** Xem `property.http.ts` cho lý do file này chỉ chứa serialization. */
export function serializeRoom(room: Room) {
  return {
    id: room.id,
    propertyId: room.propertyId,
    name: room.name,
    tenantCount: room.tenantCount,
    createdAt: room.createdAt.toISOString(),
  };
}
