// SPDX-License-Identifier: MIT

import { apiRequest } from "./api-client";
import type { ApiResult } from "../types/api.types";
import type { CreateRoomBody, Room, UpdateRoomBody } from "../types/room.types";

/** Responsibility: gọi REST API cho `Room`. Does NOT: thao tác DOM, quyết định hiển thị gì. */
export function fetchRooms(propertyId?: string): Promise<ApiResult<Room[]>> {
  const query = propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : "";
  return apiRequest<Room[]>(`/rooms${query}`);
}

export function createRoom(body: CreateRoomBody): Promise<ApiResult<Room>> {
  return apiRequest<Room>("/rooms", { method: "POST", body: JSON.stringify(body) });
}

export function updateRoom(id: string, body: UpdateRoomBody): Promise<ApiResult<Room>> {
  return apiRequest<Room>(`/rooms/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
}
