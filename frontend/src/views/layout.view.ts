// SPDX-License-Identifier: MIT

/**
 * Responsibility:
 * Dựng khung ứng dụng (app shell) MỘT LẦN vào `#app`: sidebar điều
 * hướng, tiêu đề trang, vùng cảnh báo toàn cục, vùng nội dung chính, và
 * trạng thái kết nối backend. Cung cấp các hàm cập nhật từng phần của
 * khung này cho `controllers/navigation.controller.ts` gọi khi chuyển
 * trang.
 *
 * Does NOT:
 * - quyết định route nào đang active hay tự chuyển trang — đó là việc
 *   của `controllers/navigation.controller.ts`. File này chỉ CUNG CẤP
 *   HTML và các hàm cập nhật DOM, không tự lắng nghe `hashchange`.
 * - render nội dung của TỪNG trang — mỗi trang tự render vào
 *   `#app-content` qua `getContentContainer()`.
 */
export interface NavItem {
  hash: string;
  label: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { hash: "#/dashboard", label: "Tổng quan" },
  { hash: "#/properties", label: "Cơ sở" },
  { hash: "#/rooms", label: "Phòng" },
  { hash: "#/readings", label: "Ghi chỉ số" },
  { hash: "#/invoices", label: "Hóa đơn" },
  { hash: "#/tariffs", label: "Biểu giá" },
];

function navLinkHtml(item: NavItem): string {
  return `<a class="app-nav-link" href="${item.hash}" data-hash="${item.hash}">${item.label}</a>`;
}

export function renderAppShell(): void {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) return;

  app.innerHTML = `
    <div class="app-shell">
      <aside class="app-sidebar" id="app-sidebar">
        <div class="app-brand">OpenUtilityBill</div>
        <nav class="app-nav" id="app-nav" aria-label="Điều hướng chính">
          ${NAV_ITEMS.map(navLinkHtml).join("")}
        </nav>
        <div class="app-sidebar-footer">
          <div id="backend-status"><span class="badge text-bg-secondary">Đang kiểm tra backend...</span></div>
        </div>
      </aside>
      <div class="app-main">
        <header class="app-header">
          <button type="button" class="btn btn-outline-secondary app-nav-toggle d-lg-none" id="app-nav-toggle">Menu</button>
          <h1 class="app-page-title" id="app-page-title">Tổng quan</h1>
        </header>
        <div class="app-alert-region" id="app-alert-region" aria-live="polite"></div>
        <main class="app-content" id="app-content"></main>
      </div>
    </div>
  `;

  wireNavToggle();
}

function wireNavToggle(): void {
  const toggle = document.querySelector<HTMLButtonElement>("#app-nav-toggle");
  const sidebar = document.querySelector<HTMLElement>("#app-sidebar");
  if (!toggle || !sidebar) return;
  toggle.addEventListener("click", () => sidebar.classList.toggle("app-sidebar-open"));
}

/** Đóng sidebar di động sau khi điều hướng — gọi từ navigation.controller.ts mỗi lần đổi route. */
export function closeMobileSidebar(): void {
  document.querySelector<HTMLElement>("#app-sidebar")?.classList.remove("app-sidebar-open");
}

export function setActiveNavItem(hash: string): void {
  document.querySelectorAll<HTMLAnchorElement>(".app-nav-link").forEach((link) => {
    link.classList.toggle("active", link.dataset.hash === hash);
  });
}

export function setPageTitle(title: string): void {
  const el = document.querySelector<HTMLElement>("#app-page-title");
  if (el) el.textContent = title;
}

export function getContentContainer(): HTMLElement {
  const el = document.querySelector<HTMLElement>("#app-content");
  if (!el) {
    throw new Error("Không tìm thấy #app-content trong DOM — renderAppShell() phải chạy trước.");
  }
  return el;
}
