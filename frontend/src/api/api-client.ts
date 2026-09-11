// SPDX-License-Identifier: MIT

import type { ApiResult } from "../types/api.types";

const API_V1_PREFIX = "/api/v1";

/**
 * Responsibility:
 * Một hàm gọi HTTP DUY NHẤT dùng chung cho mọi module `api/*.api.ts` —
 * gửi request tới backend qua đường dẫn TƯƠNG ĐỐI (`/api/v1/...`, Vite
 * dev server đã proxy sang backend thật, xem `vite.config.ts`), và trả
 * về `ApiResult<T>` — KHÔNG BAO GIỜ throw.
 *
 * Input: `path` — phần đường dẫn SAU `/api/v1` (ví dụ `/properties`,
 * `/rooms?propertyId=1`). `options` — `RequestInit` chuẩn của
 * `fetch()`, `Content-Type: application/json` được thêm mặc định khi
 * chưa có.
 *
 * Output: `ApiResult<T>` — backend LUÔN trả body đúng hợp đồng
 * `{ success, data }` / `{ success: false, error: { code, message } }`
 * bất kể status code (xem docs/API.md mục "Success contract"/"Error
 * contract"), nên hàm này CHỈ parse JSON và trả nguyên vẹn, không tự
 * quyết định thành công/thất bại dựa trên `response.ok`.
 *
 * Failure conditions:
 * - Lỗi mạng, backend không phản hồi, hoặc body không parse được JSON
 *   -> `{ success: false, error: { code: "NETWORK_ERROR", message: "..." } }`
 *   — một lỗi AN TOÀN phía frontend, không bao giờ lộ stack trace hay
 *   chi tiết kỹ thuật cho người dùng.
 *
 * Does NOT:
 * - hard-code origin (`http://localhost:3000`) — luôn dùng đường dẫn
 *   tương đối, để môi trường dev (Vite proxy) và một bản build production
 *   (được phục vụ cùng origin với backend) đều hoạt động không cần sửa
 *   code (xem docs/FRONTEND.md mục "No hard-coded API origin").
 * - throw lỗi ra ngoài — mọi lỗi (mong đợi hoặc không) đều trở thành
 *   một `ApiResult` thất bại, để caller luôn chỉ cần kiểm tra
 *   `result.success`.
 */
export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${API_V1_PREFIX}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });
    return (await response.json()) as ApiResult<T>;
  } catch {
    return {
      success: false,
      error: {
        code: "NETWORK_ERROR",
        message: "Không thể kết nối tới backend. Vui lòng kiểm tra kết nối và thử lại.",
      },
    };
  }
}
