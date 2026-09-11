// SPDX-License-Identifier: MIT

import { Request, Response } from "express";
import { getHealthStatus } from "./health.service";

/**
 * Trách nhiệm:
 * Nhận HTTP request cho health endpoint và chuyển kết quả từ Service
 * (Result contract) thành HTTP response JSON.
 *
 * Đầu vào: Express Request (không dùng params/body/query).
 * Đầu ra: HTTP response JSON theo success/error contract
 *   được mô tả trong docs/ERROR_HANDLING.md.
 *
 * Không chịu trách nhiệm:
 * - chứa business logic (thuộc về health.service.ts)
 * - truy cập database trực tiếp
 * - chứa raw SQL
 *
 * Lý do:
 * Controller chỉ quản lý ranh giới HTTP, để business logic có thể
 * được kiểm thử độc lập với Express (xem docs/ARCHITECTURE.md).
 */
export function getHealth(req: Request, res: Response): void {
  const result = getHealthStatus();

  if (!result.success) {
    // Fail-fast: dừng lại và trả lỗi ngay, không cố "đoán" response.
    res.status(500).json({ success: false, error: result.error });
    return;
  }

  res.status(200).json({ success: true, data: result.data });
}
