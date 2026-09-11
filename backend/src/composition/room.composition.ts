// SPDX-License-Identifier: MIT

import { getDatabaseClient } from "../database/postgres-client";
import { PostgresRoomRepository } from "../repositories/postgres/postgres-room.repository";
import { PostgresPropertyRepository } from "../repositories/postgres/postgres-property.repository";
import { RoomManagementService } from "../modules/room/room-management.service";

/** Composition root cho room module — cùng nguyên tắc LAZY với `invoice.composition.ts`/`property.composition.ts`. */
export function getRoomManagementService(): RoomManagementService {
  const sql = getDatabaseClient();
  return new RoomManagementService({
    roomRepository: new PostgresRoomRepository(sql),
    propertyRepository: new PostgresPropertyRepository(sql),
  });
}
