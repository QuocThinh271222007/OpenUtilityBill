# Frontend

This document explains the browser application — architecture, screen
map, the API-client boundary, and the precision rules that must never
be violated when displaying money. It complements `docs/API.md` and
`docs/MANAGEMENT_API.md` (the REST contract this UI consumes) and
`docs/ARCHITECTURE.md` (the same layering principle applied
backend-side).

**No production deployment exists.** This document describes how to
run the app locally (`npm run dev` in `backend/` and `frontend/`) —
nothing here claims a hosted, publicly reachable instance.

## Stack (locked)

Vite + TypeScript + HTML5 + Bootstrap (CSS only) + hand-written custom
CSS. No framework (React/Vue/Angular/Svelte), no router library, no
state-management library, no chart/form library. `frontend/package.json`
has exactly two runtime/dev dependencies: `bootstrap` and
`typescript`/`vite` — unchanged by this work.

## Architecture

```
main.ts
   ↓
controllers/  ← orchestrates one screen: calls api/, then views/
   ↓        ↓
api/       views/
   ↓
backend REST API (/api/v1/...)
```

Same `Route → Controller → api → View` separation principle as the
backend's `Route → Controller → Service → Repository`
(`docs/ARCHITECTURE.md`) — `api/*.api.ts` is the frontend's equivalent
of a Repository (isolates `fetch`), `controllers/*.controller.ts` is
the equivalent of a Service (orchestrates, no DOM/HTTP details),
`views/*.view.ts` is the equivalent of a Controller's response-shaping
(renders DOM, no business decisions).

```
frontend/src/
  api/            One function per REST operation, thin wrappers
                  around api-client.ts's apiRequest<T>().
  types/          Types mirroring the backend wire contract exactly
                  (docs/API.md conventions: string IDs, string
                  financial values, "YYYY-MM-DD" dates).
  utils/          Pure functions — HTML escaping, VND display
                  formatting, month↔billingPeriod conversion,
                  billingDifference sign classification, Vietnamese
                  enum labels. No DOM, no fetch.
  controllers/    One per screen — orchestrates api/ calls and view
                  updates, holds the screen's small amount of
                  in-memory state (e.g. which property/room is
                  selected, which record is being edited).
  views/          Renders DOM. Never calls fetch, never decides
                  *when* to do something — only *how* to show it.
  main.ts         The only "wiring" file: builds the app shell,
                  registers routes, starts the router, kicks off the
                  backend health check.
```

Every screen's controller function is a plain, explicitly-named async
function (`renderDashboardPage`, `renderPropertyManagementPage`,
`renderRoomManagementPage`, `renderMeterReadingManagementPage`,
`renderInvoiceManagementPage`, `renderTariffManagementPage`) — not a
generic "component" system. Each one fully re-renders its screen's
markup into `#app-content` on every visit, then re-attaches event
listeners to the freshly created elements; there is no persistent
component tree to reconcile, so there is no risk of stale/duplicate
listeners across navigations.

## Navigation — hash-based, no router library

`controllers/navigation.controller.ts` is a **tiny router** — a static
list of `{ hash, label, render }` entries and one `hashchange`
listener. No dynamic path parameters, no nested routes, no history
API beyond what `location.hash` already provides.

| Hash | Screen |
|---|---|
| `#/dashboard` | Tổng quan |
| `#/properties` | Cơ sở |
| `#/rooms` | Phòng |
| `#/readings` | Ghi chỉ số |
| `#/invoices` | Hóa đơn (also hosts "Đối chiếu" — actual-vs-legal comparison — inside the same screen, per the simpler of the two allowed options) |
| `#/tariffs` | Biểu giá (two tabs: Điện / Nước) |

Visiting an unknown or empty hash falls back to `#/dashboard`. Each
screen manages its own selection state (selected property/room/tariff
being edited) in module-level variables inside its controller — not in
the URL — which is sufficient for this scope and keeps the router
genuinely tiny.

## API client boundary

`api/api-client.ts` exports one function, `apiRequest<T>(path, options)`,
used by every `api/*.api.ts` module. It:

- Always calls a **relative** path (`/api/v1/...`) — never
  `http://localhost:3000` or any other hardcoded origin. In dev, Vite
  proxies `/api` to the backend (`vite.config.ts`); a production build
  would be served from the same origin as the API. This is why
  `NO_HARDCODED_API_ORIGIN` holds across the whole codebase.
- Parses the response body as the backend's own `{ success, data }` /
  `{ success: false, error: { code, message } }` contract regardless of
  HTTP status — the backend always returns that shape, so there is
  nothing extra to interpret.
- Never throws. A network failure (backend unreachable, non-JSON body)
  becomes `{ success: false, error: { code: "NETWORK_ERROR", message: "..." } }`
  — a safe, frontend-authored message, never a raw exception or stack
  trace reaching the UI.

Every screen displays `result.error.message` (the backend's own
Vietnamese message) through `views/shared.view.ts`'s `showGlobalAlert`,
which sets it via `textContent` — never re-interprets or replaces it
with a generic "something went wrong" string, except for one
explicitly-specified case (`TARIFF_IN_USE`, see "Tariff screens"
below), where a more actionable message is shown instead of the raw
backend text.

## Financial string rule (critical)

**The frontend never computes billing money.** It only sends values the
user typed, displays values the backend already computed, and displays
comparisons (`billingDifference`) the backend already derived. Every
type in `types/*.types.ts` models a financial/measurement field
(`previousReading`, `currentReading`, `meterMaximumValue`,
`electricityVatRate`, `unitPrice`, `pricePerCubicMeter`, `vatRate`,
`environmentalFeeRate`, `amount`, `calculatedTotal`,
`actualChargedAmount`, `billingDifference`, ...) as `string` — never
`number`. `Number(...)`/`parseFloat(...)`/`Math.round(...)` are never
applied to any of these fields anywhere in the codebase (verified by
grep as part of this task's audit — see the final report).

### Integer vs. financial decimal fields

One deliberate exception: `tenantCount`, `tierNumber`,
`peoplePerQuotaUnit`, and `fallbackTierNumber` are modeled as `number`
and read via `input.valueAsNumber`/`Number(select.value)` after an
integer check (`Number.isInteger(...)`). These are backend `INTEGER`
columns — plain counts, not `NUMERIC` financial values — so there is no
precision to lose. This distinction is documented directly in the
relevant `types/*.types.ts` files, not just here.

### Display-only VND formatting

`utils/format.ts`'s `formatVndDisplay(value: string): string` groups
thousands with `.` and keeps a non-zero fractional part after `,`
(Vietnamese convention) — entirely by **string** manipulation (split at
`"."`, reverse/group the digit characters, rejoin). It never converts
through `Number`. Examples:

```
"210756"    → "210.756 ₫"
"366994.00" → "366.994 ₫"   (an all-zero fractional part is dropped)
"6.12"      → "6,12 ₫"      (a non-zero fractional part is kept, not truncated)
```

The original API string is never mutated — only a separate display
string is derived from it.

### `billingDifference` sign classification

`utils/format.ts`'s `classifyBillingDifference(value: string)` returns
`"over" | "under" | "exact"` by inspecting the **string shape** only —
`value.startsWith("-")` for negative, a regex (`/^0+(\.0+)?$/`) for
exact zero, everything else is positive. It never parses the value to
compare against `0` numerically. The invoice screen maps this to the
required labels: over → "Thu cao hơn mức tính hợp pháp", under → "Thu
thấp hơn mức tính hợp pháp", exact → "Khớp".

### Month ↔ `billingPeriod` conversion

`<input type="month">` returns `"YYYY-MM"`; the wire format needs
`"YYYY-MM-DD"`. `utils/format.ts`'s `monthInputToBillingPeriod`/
`billingPeriodToMonthInput` do this by **string slicing/concatenation**
only (`` `${monthValue}-01` ``, `billingPeriod.slice(0, 7)`) — no `Date`
object is constructed, so there is no local-timezone risk at this
boundary (see `docs/API.md` "Date contract" for why the backend itself
insists on this).

Tariff `effectiveFrom`/`effectiveTo` use plain `<input type="date">`
instead (a real calendar date is expected, not a billing month, and the
day is **not** forced to `01` — the seeded competition electricity
tariff's real `effectiveFrom` is `2025-05-10`, see
`docs/MANAGEMENT_API.md` "Tariff effective dates"). The `<input
type="date">` value (already `"YYYY-MM-DD"`) is sent to the API
unmodified.

## HTML escaping

`utils/format.ts`'s `escapeHtml(value: string): string` escapes
`& < > " '`. Every `views/*.view.ts` function that builds an HTML
string via template literals wraps **every** interpolated
user/API-originated text field (property/room/tariff names, addresses,
invoice item descriptions, ...) in `escapeHtml(...)` before
interpolating it — verified as part of this task's audit (grep for
un-escaped `${...}` interpolations in every view file, cross-checked
against each field's origin). Plain numbers (`tenantCount`,
`tierNumber`, ...) are inserted unescaped since a JS `number` cannot
contain HTML metacharacters. `showGlobalAlert` (the single place every
backend error message reaches the DOM) goes one step further and uses
`textContent`, not `innerHTML`, at all — the safest option, used
wherever the content is a single free-form message rather than a
larger structured fragment.

## Invoice screen — the main demo screen

`#/invoices` is one screen covering the full center of the mandatory
workflow:

1. **Create**: select property → room (loaded via `GET /api/v1/rooms?propertyId=`)
   → billing month → electricity method (labeled `"Theo định mức số
   người / bậc thang"` for `QUOTA_TIERED`, `"Chưa kê khai — toàn bộ sản
   lượng theo bậc fallback"` for `FALLBACK_TIER_FLAT` — the `<option
   value="...">` itself keeps the real API enum value; only the visible
   label is Vietnamese) → water method (`"Theo m³"` /
   `"Theo số người"`) → optional actual-charged-amount text input.
   `POST /api/v1/invoices`; a blank actual-charged input sends `null`,
   **never** an empty string.
2. **Duplicate handling**: a `409 INVOICE_ALREADY_EXISTS` response
   replaces the result region with a prompt — "Hóa đơn đã tồn tại — tải
   hóa đơn đã lưu" — wired to the same readback path as (3).
3. **Read existing**: a "Xem hóa đơn đã lưu" button calls
   `GET /api/v1/invoices?roomId=...&billingPeriod=...` for the currently
   selected room/month — this is a **pure readback**, the Service on the
   backend does not recalculate anything, and neither does this screen.
4. **Result rendering**: a summary (room, billing period, tenant count
   used, both methods), a breakdown table built directly from
   `items[]` (`item.amount` used as-is — never reconstructed from
   `quantity × unitPrice` in the browser), and the legal total
   (`invoice.calculatedTotal`) shown prominently.
5. **Comparison**: when `billingDifference` is not `null`, a dedicated
   card shows actual charged, legal total, the difference, and a status
   badge (see "`billingDifference` sign classification" above).

Per `docs/CREATE_INVOICE_WORKFLOW.md`, `actualChargedAmount` can only be
supplied **at creation time** — there is no endpoint to attach it to an
already-created invoice later. To exercise the comparison flow, supply
it in the same `POST` that creates the invoice for a given
room/period, not as a follow-up action on an existing one.

## Dynamic electricity tariff tier editor

The electricity tariff form (`#/tariffs`, "Điện" tab) never assumes a
fixed tier count. `controllers/tariff.controller.ts` maintains the tier
rows as **DOM elements**, not a parallel JS array — "Thêm bậc"/"Xóa"
add/remove `[data-tier-row]` elements directly; `collectTierRows()`
reads the current DOM state back into `ElectricityTariffTierInput[]`
only when the form is submitted.

Two identifiers are deliberately kept **separate** for each row:

- The displayed **tier number** (`.app-tier-number`, disabled text
  input) — recomputed sequentially after every add/remove
  (`renumberTierRows`), purely for display and for what gets sent to
  the API.
- A **row id** (an ever-incrementing counter, `nextTierRowId`, never
  reused even after a row is removed) — used only for the "unlimited"
  checkbox's `id`/`for` attribute pair, so two rows can never end up
  with a colliding DOM `id` after an add-after-remove sequence (a real
  bug found and fixed during this task's own manual audit — see
  "What was genuinely runtime-tested" below).

Only the last row is expected to be the unbounded tier
(`thresholdKwh = null`), represented by a "Bậc cuối / không giới hạn"
checkbox that disables and clears that row's threshold field when
checked. The `fallbackTierNumber` field is a `<select>` populated from
the current tier rows (`refreshFallbackTierOptions`), so an admin can
only pick a tier number that actually exists in the form right now —
though the backend remains the authoritative validator for the full
tier-structure rules (`docs/MANAGEMENT_API.md` "Rate / quota /
fallback-tier validation").

## Tariff screens — `TARIFF_IN_USE`

When a `PUT` to either tariff endpoint fails with `TARIFF_IN_USE`, the
UI shows a specific, more actionable message instead of the backend's
raw text: *"Biểu giá này đã được dùng trong hóa đơn lịch sử. Hãy tạo
phiên bản biểu giá mới."* No bypass is offered — the correct action is
always to create a new tariff version.

## Meter reading screen

Selection flow: property → room (enables the form and loads history) →
optional month filter. `previousReading`/`currentReading`/
`meterMaximumValue` are free-text `inputmode="decimal"` fields (never
`<input type="number">`, which would let the browser silently round or
reject valid large decimal strings) with only a minimal client-side
shape check (`/^\d+(\.\d+)?$/`) — genuine validation (non-negative,
`meterMaximumValue` positivity, rollover rules) is entirely the
backend's `calculateMeterUsage`, reused unchanged; the UI does not
reimplement any of it. A `409 METER_READING_IN_USE` response (editing a
reading already cited by a historical invoice) is shown with the
backend's own message, with no workaround offered.

## App shell

`views/layout.view.ts` builds the entire shell once into `<div
id="app">` (the only markup `index.html` itself contains) — sidebar
navigation, page title, a global alert region (`#app-alert-region`,
`aria-live="polite"`), the backend-status badge, and the `#app-content`
mount point every screen renders into. The sidebar collapses into a
slide-in panel below the `lg` breakpoint, toggled by a plain-text
"Menu" button (no icon font, no emoji) — no Bootstrap JavaScript is
loaded; the toggle and the alert close button are wired with plain
`addEventListener` calls.

## Backend status

`GET /api/v1/health` is still checked on startup (`controllers/status.controller.ts`,
unchanged), now rendering into the sidebar footer instead of a
standalone page section. A failed health check only updates that one
badge — it never blocks the shell from rendering or the router from
working, per the existing project rule that the health check is
informational, not a startup gate.

## What was genuinely runtime-tested

**No browser tool was available in this session** (`claude-in-chrome`
reported browser tools not enabled) — no click-through, DOM-inspection,
or console-log verification happened in an actual browser. What *was*
verified:

- `npm run typecheck` and `npm run build` (both `tsc --noEmit` and the
  full Vite production build) — clean, no errors.
- The backend was started locally without `DATABASE_URL`, and the Vite
  dev server's `/api` proxy was exercised with real HTTP requests
  (`curl`) — confirming `GET /api/v1/health` succeeds and management
  endpoints correctly return a safe `500 INTERNAL_ERROR` (no database
  configured) rather than crashing, exactly as designed. Every
  controller/view/util module was also individually requested from the
  dev server, confirming each one transpiles without a syntax error
  (Vite's dev server returns a compile-error overlay payload instead of
  the module on a real failure — none did).
- A careful manual/static trace through every screen's controller logic
  against the exact scenarios in "Manual/static smoke audit" (this
  task's instructions) — this is how the duplicate-`id` bug in the tier
  editor (see above) was actually found and fixed, *before* any claim
  of correctness was made.
- Grep-based audits: zero hardcoded API origins, zero
  `parseFloat`/financial `Number()` coercions (the only `Number()`/
  `valueAsNumber` call sites are on `INTEGER` fields), zero secrets,
  zero React/Vue/Angular/Svelte in `package.json`, every `${...}`
  interpolation in every view file traced back to either a safe
  numeric/constant source or an `escapeHtml(...)` wrapper.

**Full click-through browser verification, and real backend
management/invoice API integration (no `DATABASE_URL` in this session,
consistent with every prior session), remain outstanding** — see the
task's final report for the exact `RUNTIME` fields.

## Running locally

```bash
cd backend && npm install && npm run dev     # http://localhost:3000
cd frontend && npm install && npm run dev    # http://localhost:5173 (or next free port)
```

The Vite dev server proxies `/api/*` to `http://localhost:3000`
(`vite.config.ts`, unchanged). With no `DATABASE_URL` set, the health
badge still turns green and every screen still renders — management/
invoice API calls return a safe `500` until a database is configured
(see `backend/.env.example`, `docs/DEVELOPMENT.md`).
