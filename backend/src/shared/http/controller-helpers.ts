// SPDX-License-Identifier: MIT

import { Response } from "express";

/**
 * Trách nhiệm:
 * Tiện ích Controller nhỏ, DÙNG CHUNG bởi mọi module HTTP (invoice,
 * property, room, meter-reading, tariff) — kiểm tra request body có
 * đúng hình dạng "object JSON thuần" hay không, và hai response helper
 * lặp lại giống hệt nhau ở mọi Controller (400 VALIDATION_ERROR, 500
 * INTERNAL_ERROR cho lỗi không mong đợi).
 *
 * Không chịu trách nhiệm:
 * - quyết định NỘI DUNG validate (đó là việc riêng của từng Controller/
 *   Service) — chỉ cung cấp hình dạng response CHUNG.
 * - bắt lỗi thay Controller — mỗi Controller vẫn tự try/catch quanh
 *   toàn bộ handler và gọi `sendInternalError` trong catch.
 */
export function isPlainRequestBody(body: unknown): body is Record<string, unknown> {
  return typeof body === "object" && body !== null && !Array.isArray(body);
}

export function sendValidationError(res: Response, message: string): void {
  res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message } });
}

/**
 * `label` nên là "<module>.controller.<handler>" (ví dụ
 * "invoice.controller.postInvoice") — chỉ dùng cho log server-side, KHÔNG
 * BAO GIỜ xuất hiện trong response gửi cho client.
 */
export function sendInternalError(label: string, error: unknown, res: Response): void {
  console.error(`[${label}] lỗi không mong đợi:`, error);
  res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "Đã xảy ra lỗi không mong đợi." } });
}
