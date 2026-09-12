// SPDX-License-Identifier: MIT

import "bootstrap/dist/css/bootstrap.min.css";
import "../styles/main.css";
import { initBackendStatusTracking } from "./controllers/status.controller";
import { initNavigation, registerRoutes } from "./controllers/navigation.controller";
import { renderAppShell } from "./views/layout.view";
import { renderDashboardPage } from "./controllers/dashboard.controller";
import { renderPropertyManagementPage } from "./controllers/property.controller";
import { renderRoomManagementPage } from "./controllers/room.controller";
import { renderMeterReadingManagementPage } from "./controllers/meter-reading.controller";
import { renderInvoiceManagementPage } from "./controllers/invoice.controller";
import { renderTariffManagementPage } from "./controllers/tariff.controller";

/**
 * Trách nhiệm:
 * Entry point phía trình duyệt — dựng khung ứng dụng (app shell), đăng
 * ký toàn bộ route thật sự tồn tại, khởi động router, và khởi tạo theo
 * dõi trạng thái backend. Đây là nơi DUY NHẤT "wiring" các module lại
 * với nhau.
 */
renderAppShell();

registerRoutes([
  { hash: "#/dashboard", label: "Tổng quan", render: renderDashboardPage },
  { hash: "#/properties", label: "Cơ sở", render: renderPropertyManagementPage },
  { hash: "#/rooms", label: "Phòng", render: renderRoomManagementPage },
  { hash: "#/readings", label: "Ghi chỉ số", render: renderMeterReadingManagementPage },
  { hash: "#/invoices", label: "Hóa đơn", render: renderInvoiceManagementPage },
  { hash: "#/tariffs", label: "Biểu giá", render: renderTariffManagementPage },
]);

initNavigation();
initBackendStatusTracking();
