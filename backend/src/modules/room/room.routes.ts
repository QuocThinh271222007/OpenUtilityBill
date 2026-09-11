// SPDX-License-Identifier: MIT

import { Router } from "express";
import { createCreateRoomController, createListRoomsController, createUpdateRoomController } from "./room.controller";
import { getRoomManagementService } from "../../composition/room.composition";

const roomRoutes = Router();

roomRoutes.get("/rooms", createListRoomsController(getRoomManagementService));
roomRoutes.post("/rooms", createCreateRoomController(getRoomManagementService));
roomRoutes.patch("/rooms/:roomId", createUpdateRoomController(getRoomManagementService));

export default roomRoutes;
