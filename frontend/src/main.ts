// SPDX-License-Identifier: MIT

import "bootstrap/dist/css/bootstrap.min.css";
import "../styles/main.css";
import { checkBackendStatus } from "./controllers/status.controller";

/**
 * Responsibility:
 * Entry point phía trình duyệt: import style và khởi chạy controller
 * cần thiết khi trang được tải.
 *
 * Does NOT:
 * - chứa logic gọi API hay render (những việc đó nằm ở controllers/,
 *   api/, views/)
 *
 * Reason:
 * main.ts là nơi duy nhất "wiring" các module lại với nhau, để mỗi
 * module không cần biết về nhau ngoài phạm vi được gọi trực tiếp.
 */
void checkBackendStatus();
