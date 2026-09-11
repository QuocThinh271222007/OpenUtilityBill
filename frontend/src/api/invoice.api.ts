// SPDX-License-Identifier: MIT

import { apiRequest } from "./api-client";
import type { ApiResult } from "../types/api.types";
import type { CreateInvoiceBody, CreateInvoiceResult, GetInvoiceResult } from "../types/invoice.types";

/** Responsibility: gọi REST API cho hóa đơn. Does NOT: tính toán điện/nước, thao tác DOM — backend là nguồn sự thật duy nhất cho mọi số tiền. */
export function createInvoice(body: CreateInvoiceBody): Promise<ApiResult<CreateInvoiceResult>> {
  return apiRequest<CreateInvoiceResult>("/invoices", { method: "POST", body: JSON.stringify(body) });
}

/** Đọc lại hóa đơn ĐÃ LƯU — KHÔNG tính toán lại (khớp GetInvoiceService phía backend). */
export function fetchInvoice(roomId: string, billingPeriod: string): Promise<ApiResult<GetInvoiceResult>> {
  const params = new URLSearchParams({ roomId, billingPeriod });
  return apiRequest<GetInvoiceResult>(`/invoices?${params.toString()}`);
}
