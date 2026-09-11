// SPDX-License-Identifier: MIT

import { fetchProperties } from "../api/property.api";
import { fetchRooms } from "../api/room.api";
import { getContentContainer } from "../views/layout.view";
import { renderDashboard } from "../views/dashboard.view";
import { renderLoading, showGlobalAlert } from "../views/shared.view";

/**
 * Responsibility:
 * Điều phối trang Tổng quan — gọi GET /api/v1/properties và
 * GET /api/v1/rooms song song, rồi render số liệu tóm tắt.
 *
 * Does NOT: gọi fetch trực tiếp, thao tác DOM trực tiếp ngoài
 * container do layout.view.ts cấp.
 */
export async function renderDashboardPage(): Promise<void> {
  const container = getContentContainer();
  renderLoading(container);

  const [propertiesResult, roomsResult] = await Promise.all([fetchProperties(), fetchRooms()]);

  if (!propertiesResult.success) {
    showGlobalAlert("danger", propertiesResult.error.message);
  }
  if (!roomsResult.success) {
    showGlobalAlert("danger", roomsResult.error.message);
  }

  renderDashboard(container, {
    propertyCount: propertiesResult.success ? propertiesResult.data.length : 0,
    roomCount: roomsResult.success ? roomsResult.data.length : 0,
  });
}
