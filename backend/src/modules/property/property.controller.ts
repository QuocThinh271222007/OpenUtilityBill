// SPDX-License-Identifier: MIT

import { Request, Response } from "express";
import { Result } from "../../shared/result";
import { mapResultErrorCodeToHttpStatus } from "../../shared/http/result-error-status";
import { isPlainRequestBody, sendInternalError, sendValidationError } from "../../shared/http/controller-helpers";
import { RentalProperty } from "./property.model";
import { CreatePropertyInput, UpdatePropertyInput } from "./property-management.types";
import { serializeProperty } from "./property.http";

/**
 * Responsibility:
 * Nhận HTTP request cho `GET/POST /api/v1/properties`,
 * `PATCH /api/v1/properties/:propertyId`, chuyển sang
 * `CreatePropertyInput`/`UpdatePropertyInput`, gọi
 * `PropertyManagementService`, và chuyển `Result` thành HTTP response
 * JSON. Cùng pattern dependency-injection (`getService: () => Service`,
 * gọi SAU khi validate) như `invoice.controller.ts` — xem file đó cho
 * lý do đầy đủ.
 *
 * Does NOT:
 * - chứa business validation (trim/empty-to-null cho name/address) —
 *   đó là việc của `PropertyManagementService`. Controller chỉ kiểm tra
 *   HÌNH DẠNG JS nguyên thuỷ (string/null/undefined).
 * - import Postgres.js/SQL.
 */
interface PropertyManagementServiceLike {
  list(): Promise<Result<RentalProperty[]>>;
  create(input: CreatePropertyInput): Promise<Result<RentalProperty>>;
  update(id: string, input: UpdatePropertyInput): Promise<Result<RentalProperty>>;
}

export function createListPropertiesController(getService: () => PropertyManagementServiceLike) {
  return async function listProperties(_req: Request, res: Response): Promise<void> {
    try {
      const result = await getService().list();
      if (!result.success) {
        res.status(mapResultErrorCodeToHttpStatus(result.error.code)).json({ success: false, error: result.error });
        return;
      }
      res.status(200).json({ success: true, data: result.data.map(serializeProperty) });
    } catch (error) {
      sendInternalError("property.controller.listProperties", error, res);
    }
  };
}

export function createCreatePropertyController(getService: () => PropertyManagementServiceLike) {
  return async function createProperty(req: Request, res: Response): Promise<void> {
    try {
      if (!isPlainRequestBody(req.body)) {
        sendValidationError(res, "Request body phải là một object JSON.");
        return;
      }
      const body = req.body;

      if (typeof body.name !== "string") {
        sendValidationError(res, "name là bắt buộc và phải là chuỗi.");
        return;
      }
      if (body.address !== null && body.address !== undefined && typeof body.address !== "string") {
        sendValidationError(res, "address phải là chuỗi hoặc null.");
        return;
      }

      const result = await getService().create({
        name: body.name,
        address: typeof body.address === "string" ? body.address : null,
      });

      if (!result.success) {
        res.status(mapResultErrorCodeToHttpStatus(result.error.code)).json({ success: false, error: result.error });
        return;
      }
      res.status(201).json({ success: true, data: serializeProperty(result.data) });
    } catch (error) {
      sendInternalError("property.controller.createProperty", error, res);
    }
  };
}

export function createUpdatePropertyController(getService: () => PropertyManagementServiceLike) {
  return async function updateProperty(req: Request, res: Response): Promise<void> {
    try {
      if (!isPlainRequestBody(req.body)) {
        sendValidationError(res, "Request body phải là một object JSON.");
        return;
      }
      const body = req.body;

      const input: UpdatePropertyInput = {};
      if (body.name !== undefined) {
        if (typeof body.name !== "string") {
          sendValidationError(res, "name phải là chuỗi.");
          return;
        }
        input.name = body.name;
      }
      if (body.address !== undefined) {
        if (body.address !== null && typeof body.address !== "string") {
          sendValidationError(res, "address phải là chuỗi hoặc null.");
          return;
        }
        input.address = body.address;
      }

      const result = await getService().update(req.params.propertyId, input);

      if (!result.success) {
        res.status(mapResultErrorCodeToHttpStatus(result.error.code)).json({ success: false, error: result.error });
        return;
      }
      res.status(200).json({ success: true, data: serializeProperty(result.data) });
    } catch (error) {
      sendInternalError("property.controller.updateProperty", error, res);
    }
  };
}
