// SPDX-License-Identifier: MIT

import { fetchHealth } from "../api/health.api";
import { renderBackendOffline, renderBackendOnline } from "../views/status.view";

/**
 * Responsibility:
 * Điều phối luồng kiểm tra trạng thái backend: gọi api/health.api.ts,
 * rồi gọi View phù hợp (views/status.view.ts) theo kết quả.
 *
 * Does NOT:
 * - gọi fetch trực tiếp
 * - thao tác DOM trực tiếp
 *
 * Reason:
 * Controller là nơi duy nhất biết "làm gì tiếp theo" dựa trên kết quả
 * API, giữ cho api/ và views/ không phụ thuộc lẫn nhau — cùng ranh
 * giới Route → Controller → Service được mô tả ở phía backend, áp
 * dụng tương tự cho phía frontend.
 */
export async function checkBackendStatus(): Promise<void> {
  const result = await fetchHealth();

  if (!result.success) {
    renderBackendOffline(result.error.message);
    return;
  }

  renderBackendOnline();
}
