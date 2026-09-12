// SPDX-License-Identifier: MIT

import { BACKEND_OFFLINE_EVENT, BACKEND_ONLINE_EVENT } from "../api/api-client";
import { fetchHealth } from "../api/health.api";
import { renderBackendOffline, renderBackendOnline } from "../views/status.view";

/**
 * Khởi tạo trạng thái backend và giữ badge đồng bộ với các request thật.
 * Mọi HTTP response đều chứng minh backend đang phản hồi; chỉ lỗi fetch
 * hoàn toàn mới chuyển trạng thái sang offline.
 */
export function initBackendStatusTracking(): void {
  window.addEventListener(BACKEND_ONLINE_EVENT, () => renderBackendOnline());
  window.addEventListener(BACKEND_OFFLINE_EVENT, (event) => {
    const detail = (event as CustomEvent<{ message?: string }>).detail;
    renderBackendOffline(detail?.message ?? "Không thể kết nối tới backend.");
  });

  void checkBackendStatus();
}

export async function checkBackendStatus(): Promise<void> {
  const result = await fetchHealth();

  if (!result.success) {
    renderBackendOffline(result.error.message);
    return;
  }

  renderBackendOnline();
}
