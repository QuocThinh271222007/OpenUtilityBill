// SPDX-License-Identifier: MIT

import { Request, Response } from "express";
import { Result } from "../../shared/result";
import { mapResultErrorCodeToHttpStatus } from "../../shared/http/result-error-status";
import { parseFirstOfMonthWireFormat } from "../../shared/http/date-wire-format";
import { isPlainRequestBody, sendInternalError, sendValidationError } from "../../shared/http/controller-helpers";
import { MeterReading } from "./meter-reading.model";
import { CreateMeterReadingInput, UpdateMeterReadingInput } from "./meter-reading-management.types";
import { serializeMeterReading } from "./meter-reading.http";

/**
 * Trách nhiệm:
 * Nhận HTTP request cho `GET/POST /api/v1/meter-readings`,
 * `PUT /api/v1/meter-readings/:readingId`. Cùng pattern với các
 * Controller khác — xem `invoice.controller.ts` cho lý do đầy đủ.
 *
 * Không chịu trách nhiệm:
 * - kiểm tra tổ hợp previous/current/max hợp lệ (rollover, ...) — đó là
 *   `calculateMeterUsage` bên trong `MeterReadingManagementService`.
 *   Controller chỉ kiểm tra HÌNH DẠNG JS nguyên thuỷ và parse
 *   billingPeriod.
 */
interface MeterReadingManagementServiceLike {
  list(roomId: string, billingPeriod?: Date): Promise<Result<MeterReading[]>>;
  create(input: CreateMeterReadingInput): Promise<Result<MeterReading>>;
  update(id: string, input: UpdateMeterReadingInput): Promise<Result<MeterReading>>;
}

function extractBody(
  req: Request,
  res: Response
): { roomId: string; billingPeriod: Date; utilityType: string; previousReading: string; currentReading: string; meterMaximumValue: string | null } | null {
  if (!isPlainRequestBody(req.body)) {
    sendValidationError(res, "Request body phải là một object JSON.");
    return null;
  }
  const body = req.body;

  if (typeof body.roomId !== "string") {
    sendValidationError(res, "roomId là bắt buộc và phải là chuỗi.");
    return null;
  }
  if (typeof body.utilityType !== "string") {
    sendValidationError(res, "utilityType là bắt buộc và phải là chuỗi.");
    return null;
  }
  if (typeof body.previousReading !== "string") {
    sendValidationError(res, "previousReading là bắt buộc và phải là chuỗi.");
    return null;
  }
  if (typeof body.currentReading !== "string") {
    sendValidationError(res, "currentReading là bắt buộc và phải là chuỗi.");
    return null;
  }
  if (body.meterMaximumValue !== null && typeof body.meterMaximumValue !== "string") {
    sendValidationError(res, "meterMaximumValue phải là chuỗi hoặc null.");
    return null;
  }

  const billingPeriodResult = parseFirstOfMonthWireFormat(body.billingPeriod);
  if (!billingPeriodResult.success) {
    res.status(400).json({ success: false, error: billingPeriodResult.error });
    return null;
  }

  return {
    roomId: body.roomId,
    billingPeriod: billingPeriodResult.data,
    utilityType: body.utilityType,
    previousReading: body.previousReading,
    currentReading: body.currentReading,
    meterMaximumValue: body.meterMaximumValue === null ? null : body.meterMaximumValue,
  };
}

export function createListMeterReadingsController(getService: () => MeterReadingManagementServiceLike) {
  return async function listMeterReadings(req: Request, res: Response): Promise<void> {
    try {
      const roomId = req.query.roomId;
      if (typeof roomId !== "string") {
        sendValidationError(res, "roomId là bắt buộc và phải là một chuỗi (query string).");
        return;
      }

      let billingPeriod: Date | undefined;
      if (req.query.billingPeriod !== undefined) {
        const billingPeriodResult = parseFirstOfMonthWireFormat(req.query.billingPeriod);
        if (!billingPeriodResult.success) {
          res.status(400).json({ success: false, error: billingPeriodResult.error });
          return;
        }
        billingPeriod = billingPeriodResult.data;
      }

      const result = await getService().list(roomId, billingPeriod);
      if (!result.success) {
        res.status(mapResultErrorCodeToHttpStatus(result.error.code)).json({ success: false, error: result.error });
        return;
      }
      res.status(200).json({ success: true, data: result.data.map(serializeMeterReading) });
    } catch (error) {
      sendInternalError("meter-reading.controller.listMeterReadings", error, res);
    }
  };
}

export function createCreateMeterReadingController(getService: () => MeterReadingManagementServiceLike) {
  return async function createMeterReading(req: Request, res: Response): Promise<void> {
    try {
      const body = extractBody(req, res);
      if (body === null) {
        return;
      }

      const result = await getService().create(body);
      if (!result.success) {
        res.status(mapResultErrorCodeToHttpStatus(result.error.code)).json({ success: false, error: result.error });
        return;
      }
      res.status(201).json({ success: true, data: serializeMeterReading(result.data) });
    } catch (error) {
      sendInternalError("meter-reading.controller.createMeterReading", error, res);
    }
  };
}

export function createUpdateMeterReadingController(getService: () => MeterReadingManagementServiceLike) {
  return async function updateMeterReading(req: Request, res: Response): Promise<void> {
    try {
      const body = extractBody(req, res);
      if (body === null) {
        return;
      }

      const result = await getService().update(req.params.readingId, body);
      if (!result.success) {
        res.status(mapResultErrorCodeToHttpStatus(result.error.code)).json({ success: false, error: result.error });
        return;
      }
      res.status(200).json({ success: true, data: serializeMeterReading(result.data) });
    } catch (error) {
      sendInternalError("meter-reading.controller.updateMeterReading", error, res);
    }
  };
}
