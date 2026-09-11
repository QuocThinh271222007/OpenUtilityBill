// SPDX-License-Identifier: MIT

/**
 * Responsibility:
 * Render trang Tổng quan — số liệu tóm tắt (chỉ những gì API thực sự
 * cung cấp: số cơ sở, số phòng) và các nút thao tác nhanh.
 *
 * Does NOT:
 * - tự tính hay suy đoán số liệu API không cung cấp (không có biểu đồ,
 *   không có thống kê doanh thu, ... xem docs/FRONTEND.md mục "Out of
 *   scope").
 */
export interface DashboardSummary {
  propertyCount: number;
  roomCount: number;
}

export function renderDashboard(container: HTMLElement, summary: DashboardSummary): void {
  container.innerHTML = `
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
        <a class="btn btn-primary" href="#/properties">Thêm cơ sở</a>
        <a class="btn btn-primary" href="#/rooms">Thêm phòng</a>
        <a class="btn btn-primary" href="#/readings">Ghi chỉ số</a>
        <a class="btn btn-primary" href="#/invoices">Tạo hóa đơn</a>
      </div>
    </div>
  `;
}
