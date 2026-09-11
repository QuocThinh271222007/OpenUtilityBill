// SPDX-License-Identifier: MIT

import { Request, Response } from "express";
import { Result } from "../../shared/result";
import { mapResultErrorCodeToHttpStatus } from "../../shared/http/result-error-status";
import { isPlainRequestBody, sendInternalError, sendValidationError } from "../../shared/http/controller-helpers";
import { Room } from "./room.model";
import { CreateRoomInput, UpdateRoomInput } from "./room-management.types";
import { serializeRoom } from "./room.http";

/**
 * Responsibility:
 * Nhận HTTP request cho `GET/POST /api/v1/rooms`,
 * `PATCH /api/v1/rooms/:roomId`. Cùng pattern với
 * `property.controller.ts`/`invoice.controller.ts` — xem các file đó
 * cho lý do đầy đủ (dependency injection qua `getService`, gọi SAU khi
 * validate).
 *
 * Does NOT:
 * - validate propertyId tồn tại, tên trùng, hay tenantCount hợp lệ —
 *   chỉ kiểm tra HÌNH DẠNG JS nguyên thuỷ (string/number). Business
 *   rules thuộc `RoomManagementService`.
 */
interface RoomManagementServiceLike {
  list(propertyId?: string): Promise<Result<Room[]>>;
  create(input: CreateRoomInput): Promise<Result<Room>>;
  update(id: string, input: UpdateRoomInput): Promise<Result<Room>>;
}

export function createListRoomsController(getService: () => RoomManagementServiceLike) {
  return async function listRooms(req: Request, res: Response): Promise<void> {
    try {
      const propertyIdQuery = req.query.propertyId;
      if (propertyIdQuery !== undefined && typeof propertyIdQuery !== "string") {
        sendValidationError(res, "propertyId (query) phải là một chuỗi.");
        return;
      }

      const result = await getService().list(propertyIdQuery);
      if (!result.success) {
        res.status(mapResultErrorCodeToHttpStatus(result.error.code)).json({ success: false, error: result.error });
        return;
      }
      res.status(200).json({ success: true, data: result.data.map(serializeRoom) });
    } catch (error) {
      sendInternalError("room.controller.listRooms", error, res);
    }
  };
}

export function createCreateRoomController(getService: () => RoomManagementServiceLike) {
  return async function createRoom(req: Request, res: Response): Promise<void> {
    try {
      if (!isPlainRequestBody(req.body)) {
        sendValidationError(res, "Request body phải là một object JSON.");
        return;
      }
      const body = req.body;

      if (typeof body.propertyId !== "string") {
        sendValidationError(res, "propertyId là bắt buộc và phải là chuỗi.");
        return;
      }
      if (typeof body.name !== "string") {
        sendValidationError(res, "name là bắt buộc và phải là chuỗi.");
        return;
      }
      if (typeof body.tenantCount !== "number") {
        sendValidationError(res, "tenantCount là bắt buộc và phải là số.");
        return;
      }

      const result = await getService().create({ propertyId: body.propertyId, name: body.name, tenantCount: body.tenantCount });

      if (!result.success) {
        res.status(mapResultErrorCodeToHttpStatus(result.error.code)).json({ success: false, error: result.error });
        return;
      }
      res.status(201).json({ success: true, data: serializeRoom(result.data) });
    } catch (error) {
      sendInternalError("room.controller.createRoom", error, res);
    }
  };
}

export function createUpdateRoomController(getService: () => RoomManagementServiceLike) {
  return async function updateRoom(req: Request, res: Response): Promise<void> {
    try {
      if (!isPlainRequestBody(req.body)) {
        sendValidationError(res, "Request body phải là một object JSON.");
        return;
      }
      const body = req.body;

      const input: UpdateRoomInput = {};
      if (body.name !== undefined) {
        if (typeof body.name !== "string") {
          sendValidationError(res, "name phải là chuỗi.");
          return;
        }
        input.name = body.name;
      }
      if (body.tenantCount !== undefined) {
        if (typeof body.tenantCount !== "number") {
          sendValidationError(res, "tenantCount phải là số.");
          return;
        }
        input.tenantCount = body.tenantCount;
      }

      const result = await getService().update(req.params.roomId, input);

      if (!result.success) {
        res.status(mapResultErrorCodeToHttpStatus(result.error.code)).json({ success: false, error: result.error });
        return;
      }
      res.status(200).json({ success: true, data: serializeRoom(result.data) });
    } catch (error) {
      sendInternalError("room.controller.updateRoom", error, res);
    }
  };
}
