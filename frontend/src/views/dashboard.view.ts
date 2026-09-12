// SPDX-License-Identifier: MIT

import { pageIntroHtml } from "./shared.view";

/**
 * Trách nhiệm:
 * Render trang Tổng quan — số liệu tóm tắt (chỉ những gì API thực sự
 * cung cấp: số cơ sở, số phòng) và các nút thao tác nhanh. Khi CHƯA có
 * cơ sở nào, hiển thị một hướng dẫn bước tiếp theo duy nhất thay cho
 * hàng loạt nút thao tác chưa dùng được (thêm phòng/ghi chỉ số/tạo hoá
 * đơn đều cần có cơ sở + phòng trước).
 *
 * Không chịu trách nhiệm:
 * - tự tính hay suy đoán số liệu API không cung cấp (không có biểu đồ,
 *   không có thống kê doanh thu, ... xem docs/FRONTEND.md mục "Out of
 *   scope").
 */
export interface DashboardSummary {
  propertyCount: number;
  roomCount: number;
}

function emptyDashboardHtml(): string {
  return `
    <div class="card">
      <div class="card-body app-empty-state">
        <p class="mb-1">Chưa có cơ sở cho thuê.</p>
        <p class="text-muted mb-0">Tạo cơ sở đầu tiên để bắt đầu quản lý phòng và hóa đơn.</p>
        <div class="app-empty-state-action">
          <a class="btn btn-primary" href="#/properties">Tạo cơ sở</a>
        </div>
      </div>
    </div>
  `;
}

function summaryHtml(summary: DashboardSummary): string {
  return `
    <div class="row g-3 mb-4">
      <div class="col-sm-6 col-lg-3">
        <div class="card app-stat-card">
          <div class="card-body">
            <div class="app-stat-label">Số cơ sở</div>
            <div class="app-stat-value">${summary.propertyCount}</div>
          </div>
        </div>
      </div>
      <div class="col-sm-6 col-lg-3">
        <div class="card app-stat-card">
          <div class="card-body">
            <div class="app-stat-label">Số phòng</div>
            <div class="app-stat-value">${summary.roomCount}</div>
          </div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header">Thao tác nhanh</div>
      <div class="card-body d-flex flex-wrap gap-2">
        <a class="btn btn-primary" href="#/rooms">Thêm phòng</a>
        <a class="btn btn-outline-secondary" href="#/readings">Ghi chỉ số</a>
        <a class="btn btn-outline-secondary" href="#/invoices">Tạo hóa đơn</a>
      </div>
    </div>
  `;
}

export function renderDashboard(container: HTMLElement, summary: DashboardSummary): void {
  const intro = pageIntroHtml("Xem nhanh số cơ sở và số phòng đang quản lý.");
  const body = summary.propertyCount === 0 ? emptyDashboardHtml() : summaryHtml(summary);
  container.innerHTML = `${intro}${body}`;
}
