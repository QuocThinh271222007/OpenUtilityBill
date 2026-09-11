// SPDX-License-Identifier: MIT

import { closeMobileSidebar, setActiveNavItem, setPageTitle } from "../views/layout.view";
import { clearGlobalAlerts } from "../views/shared.view";

/**
 * Trách nhiệm:
 * Một bộ định tuyến (router) phía trình duyệt CỰC NHỎ, dựa trên
 * `location.hash` — KHÔNG dùng thư viện router nào (xem docs/FRONTEND.md
 * mục "No router dependency"). Ánh xạ `#/dashboard`, `#/properties`,
 * `#/rooms`, `#/readings`, `#/invoices`, `#/tariffs` sang hàm render
 * của từng screen, và điều phối việc chuyển trang KHÔNG reload trang
 * (`hashchange` event).
 *
 * Input: `registerRoutes(routes)` gọi MỘT LẦN ở `main.ts`, đăng ký toàn
 * bộ route thật sự tồn tại. `initNavigation()` gắn listener và render
 * route ban đầu.
 *
 * Bất biến quan trọng:
 * Route không khớp bất kỳ `hash` nào đã đăng ký (bao gồm hash rỗng lúc
 * tải trang lần đầu) sẽ fallback về `DEFAULT_ROUTE` — không bao giờ để
 * trang trắng.
 *
 * Không chịu trách nhiệm:
 * - tự parse tham số động trong hash (ví dụ `#/invoices/123`) — mọi
 *   route hiện tại là đường dẫn TĨNH; các screen tự giữ trạng thái lựa
 *   chọn (property/room/kỳ) qua state module nội bộ của Controller đó,
 *   không qua URL — đủ cho phạm vi bắt buộc của kỳ thi.
 */
export interface RouteDefinition {
  hash: string;
  label: string;
  render: () => void | Promise<void>;
}

const DEFAULT_ROUTE_HASH = "#/dashboard";

let routes: RouteDefinition[] = [];

export function registerRoutes(routeDefinitions: RouteDefinition[]): void {
  routes = routeDefinitions;
}

export function initNavigation(): void {
  window.addEventListener("hashchange", () => void handleRouteChange());

  if (!window.location.hash) {
    window.location.hash = DEFAULT_ROUTE_HASH;
    return;
  }
  void handleRouteChange();
}

/** Điều hướng chương trình (ví dụ nút "Thêm cơ sở" ở Tổng quan). Nếu hash không đổi (đã ở đúng trang), vẫn render lại — hữu ích khi một trang cần "làm mới" chính nó. */
export function navigateTo(hash: string): void {
  if (window.location.hash === hash) {
    void handleRouteChange();
    return;
  }
  window.location.hash = hash;
}

async function handleRouteChange(): Promise<void> {
  const currentHash = window.location.hash || DEFAULT_ROUTE_HASH;
  const route = routes.find((r) => r.hash === currentHash) ?? routes.find((r) => r.hash === DEFAULT_ROUTE_HASH);
  if (!route) return;

  clearGlobalAlerts();
  closeMobileSidebar();
  setActiveNavItem(route.hash);
  setPageTitle(route.label);
  await route.render();
}
