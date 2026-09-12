// SPDX-License-Identifier: MIT

import type { ApiResult } from "../types/api.types";

const API_V1_PREFIX = "/api/v1";

export const BACKEND_ONLINE_EVENT = "openutilitybill:backend-online";
export const BACKEND_OFFLINE_EVENT = "openutilitybill:backend-offline";

function notifyBackendOnline(): void {
  window.dispatchEvent(new Event(BACKEND_ONLINE_EVENT));
}

function notifyBackendOffline(message: string): void {
  window.dispatchEvent(new CustomEvent(BACKEND_OFFLINE_EVENT, { detail: { message } }));
}

/**
 * Trách nhiệm:
 * Một hàm gọi HTTP DUY NHẤT dùng chung cho mọi module `api/*.api.ts` —
 * gửi request tới backend qua đường dẫn TƯƠNG ĐỐI (`/api/v1/...`, Vite
 * dev server đã proxy sang backend thật, xem `vite.config.ts`), và trả
 * về `ApiResult<T>` — KHÔNG BAO GIỜ throw.
 *
 * Phân biệt rõ hai loại lỗi hạ tầng:
 * - fetch thất bại hoàn toàn -> NETWORK_ERROR + backend offline event.
 * - backend đã trả HTTP nhưng body không phải JSON hợp lệ -> INVALID_RESPONSE;
 *   backend vẫn được xem là đang phản hồi.
 */
export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<ApiResult<T>> {
  let response: Response;

  try {
    response = await fetch(`${API_V1_PREFIX}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });
    notifyBackendOnline();
  } catch {
    const message = "Không thể gửi yêu cầu tới backend. Vui lòng kiểm tra kết nối và thử lại.";
    notifyBackendOffline(message);
    return {
      success: false,
      error: {
        code: "NETWORK_ERROR",
        message,
      },
    };
  }

  try {
    return (await response.json()) as ApiResult<T>;
  } catch {
    return {
      success: false,
      error: {
        code: "INVALID_RESPONSE",
        message: "Backend đã phản hồi nhưng dữ liệu trả về không đúng định dạng mong đợi.",
      },
    };
  }
}
