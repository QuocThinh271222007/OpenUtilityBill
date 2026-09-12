// SPDX-License-Identifier: MIT

import { Request, Response } from "express";
import { Result } from "../../shared/result";
import { isPlainRequestBody, sendInternalError, sendValidationError } from "../../shared/http/controller-helpers";
import { CreateInvoiceInput, CreateInvoiceResult } from "./create-invoice.types";
import { GetInvoiceInput, GetInvoiceResult } from "./get-invoice.types";
import {
  mapResultErrorCodeToHttpStatus,
  parseBillingPeriodWireFormat,
  serializeCreateInvoiceResult,
  serializeGetInvoiceResult,
} from "./invoice.http";

/**
 * Trách nhiệm:
 * Nhận HTTP request cho `POST /api/v1/invoices` và
 * `GET /api/v1/invoices`, chuyển sang `CreateInvoiceInput`/
 * `GetInvoiceInput`, gọi Service tương ứng, và chuyển `Result` thành
 * HTTP response JSON (`docs/ERROR_HANDLING.md`).
 *
 * Input: mỗi factory (`createPostInvoiceController`/
 * `createGetInvoiceController`) nhận một HÀM `getService: () => Service`
 * (không phải một instance có sẵn) — cho phép test Controller bằng một
 * fake Service (`() => fakeService`), không cần PostgreSQL (xem
 * `__tests__/invoice.controller.test.ts`). Việc lắp ráp Service THẬT
 * (Postgres) là trách nhiệm của `../../composition/invoice.composition.ts`,
 * KHÔNG phải của file này.
 *
 * Important invariant — `getService()` được gọi SAU khi validate xong:
 * `getService()` (tạo Service THẬT) đụng tới `getDatabaseClient()`, vốn
 * throw khi thiếu `DATABASE_URL`. Nếu gọi nó TRƯỚC khi validate request
 * body, một request sai hình dạng (lẽ ra phải trả 400) sẽ luôn trả 500
 * bất kể lỗi thật sự là gì, chỉ vì database chưa sẵn sàng — validate
 * input KHÔNG cần database. Vì vậy `getService()` chỉ được gọi ngay
 * trước khi thực sự cần cho `service.execute(...)`.
 *
 * Không chịu trách nhiệm:
 * - tính điện/nước, truy vấn SQL, hay tự dựng transaction context —
 *   mọi việc đó thuộc Service/Repository. File này CHỈ trích xuất field
 *   nguyên thuỷ từ request, gọi Service, và ánh xạ Result -> response.
 * - import Postgres.js hay `DatabaseExecutor`.
 * - lộ `error.stack`/chi tiết lỗi nội bộ ra response — lỗi không mong
 *   đợi (throw ngoài `Result` contract) được bắt và trả về một mã 500
 *   chung chung (`INTERNAL_ERROR`), log chi tiết chỉ ở server.
 */
interface CreateInvoiceServiceLike {
  execute(input: CreateInvoiceInput): Promise<Result<CreateInvoiceResult>>;
}

interface GetInvoiceServiceLike {
  execute(input: GetInvoiceInput): Promise<Result<GetInvoiceResult>>;
}

interface DeleteInvoiceServiceLike {
  execute(invoiceId: string): Promise<Result<{ id: string }>>;
}

export function createPostInvoiceController(getService: () => CreateInvoiceServiceLike) {
  return async function postInvoice(req: Request, res: Response): Promise<void> {
    try {
      if (!isPlainRequestBody(req.body)) {
        sendValidationError(res, "Request body phải là một object JSON.");
        return;
      }
      const body = req.body;

      if (typeof body.roomId !== "string") {
        sendValidationError(res, "roomId là bắt buộc và phải là chuỗi.");
        return;
      }
      if (typeof body.electricityBillingMethod !== "string") {
        sendValidationError(res, "electricityBillingMethod là bắt buộc và phải là chuỗi.");
        return;
      }
      if (typeof body.waterBillingMethod !== "string") {
        sendValidationError(res, "waterBillingMethod là bắt buộc và phải là chuỗi.");
        return;
      }
      if (body.actualChargedAmount !== null && body.actualChargedAmount !== undefined && typeof body.actualChargedAmount !== "string") {
        sendValidationError(res, "actualChargedAmount phải là chuỗi hoặc null.");
        return;
      }

      const billingPeriodResult = parseBillingPeriodWireFormat(body.billingPeriod);
      if (!billingPeriodResult.success) {
        res.status(400).json({ success: false, error: billingPeriodResult.error });
        return;
      }

      const result = await getService().execute({
        roomId: body.roomId,
        billingPeriod: billingPeriodResult.data,
        electricityBillingMethod: body.electricityBillingMethod,
        waterBillingMethod: body.waterBillingMethod,
        actualChargedAmount: typeof body.actualChargedAmount === "string" ? body.actualChargedAmount : null,
      });

      if (!result.success) {
        res.status(mapResultErrorCodeToHttpStatus(result.error.code)).json({ success: false, error: result.error });
        return;
      }

      res.status(201).json({ success: true, data: serializeCreateInvoiceResult(result.data) });
    } catch (error) {
      sendInternalError("invoice.controller.postInvoice", error, res);
    }
  };
}

export function createGetInvoiceController(getService: () => GetInvoiceServiceLike) {
  return async function getInvoice(req: Request, res: Response): Promise<void> {
    try {
      const roomId = req.query.roomId;
      if (typeof roomId !== "string") {
        sendValidationError(res, "roomId là bắt buộc và phải là một chuỗi (query string).");
        return;
      }

      const billingPeriodResult = parseBillingPeriodWireFormat(req.query.billingPeriod);
      if (!billingPeriodResult.success) {
        res.status(400).json({ success: false, error: billingPeriodResult.error });
        return;
      }

      const result = await getService().execute({ roomId, billingPeriod: billingPeriodResult.data });

      if (!result.success) {
        res.status(mapResultErrorCodeToHttpStatus(result.error.code)).json({ success: false, error: result.error });
        return;
      }

      res.status(200).json({ success: true, data: serializeGetInvoiceResult(result.data) });
    } catch (error) {
      sendInternalError("invoice.controller.getInvoice", error, res);
    }
  };
}

export function createDeleteInvoiceController(getService: () => DeleteInvoiceServiceLike) {
  return async function deleteInvoice(req: Request, res: Response): Promise<void> {
    try {
      const result = await getService().execute(req.params.invoiceId);
      if (!result.success) {
        res.status(mapResultErrorCodeToHttpStatus(result.error.code)).json({ success: false, error: result.error });
        return;
      }
      res.status(200).json({ success: true, data: { id: result.data.id } });
    } catch (error) {
      sendInternalError("invoice.controller.deleteInvoice", error, res);
    }
  };
}
