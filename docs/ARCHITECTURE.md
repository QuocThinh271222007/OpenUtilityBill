# Architecture

This document explains how OpenUtilityBill is structured, and why. It is
written for the repository owner to reuse during the oral defense of this
project — every decision here should be explainable, not just "how the
starter kit did it."

## 1. Modular Monolith

OpenUtilityBill is deployed as **one** backend application (one Node.js
process) and **one** frontend application (one static build). This is what
"monolith" refers to here: a deployment shape, not a judgement about code
quality.

Internally, the backend source code is organized into small, independent
**modules** by business domain:

```
backend/src/modules/
  health/
  property/      (future)
  room/          (future)
  meter-reading/ (future)
  tariff/        (future)
  invoice/       (future)
```

This is what "modular" refers to: internal source-code organization. Each
module owns its own routes, controller, service, and (later) repository.
Modules do not reach into each other's internals — if module A needs data
owned by module B, it calls B's Service, not B's Repository directly.

### Why not microservices

Microservices would mean multiple independently deployable processes,
network calls between them, and infrastructure (service discovery, message
queues, containers) to coordinate them. For a single-developer competition
project with a small, well-understood domain (rental utility billing),
that overhead would not buy anything — it would only add moving parts that
are hard to run, debug, and explain in an oral defense. A Modular Monolith
gives the same internal separation of concerns without the deployment and
network complexity. See `docs/LEARNING_NOTES.md` for more on this
trade-off.

## 2. MVC, extended with Service and Repository

Plain MVC (Model–View–Controller) does not have a clear place for
multi-step business workflows or for isolating database access. This
project extends MVC with two additional layers:

| Layer | Responsibility | Must NOT do |
|---|---|---|
| **View** | HTML, Bootstrap, custom CSS, browser-side TypeScript. Displays data, gathers input, calls the REST API. | Never runs SQL or talks to the database directly. |
| **Controller** | Receives the HTTP request, parses it, calls a Service, translates the `Result` back into an HTTP response. | No calculation formulas. No raw SQL. |
| **Service / Orchestrator** | Coordinates a business workflow: decides call order, calls business modules and Repositories. | Never renders HTML or touches `Request`/`Response` objects. |
| **Repository** | Owns database access; contains or invokes SQL. | Never contains business/calculation logic. |
| **Model / Types** | Domain data shapes and contracts (e.g. `Result<T>`). | — |
| **Calculation Core** *(future)* | Pure TypeScript functions for tariff/quota/invoice math. | No dependency on Express, HTML, or Supabase. |

### Why Service exists

Without a Service layer, Controllers end up doing validation, database
lookups, and calculations all at once — the "bad example" documented in
the project brief. A Service's only job is to decide *what happens in what
order*. This keeps Controllers thin (HTTP-only) and keeps calculation
logic (once added) independently testable without an HTTP server running.

### Why Repository exists

Repositories isolate SQL and Supabase-specific access behind a small,
purpose-named function set (e.g. `findRoomById`). This means:

- Business logic never depends on *how* data is stored.
- The database technology could change without touching Services or
  Controllers.
- SQL is reviewable in one place per domain, instead of scattered across
  Controllers.

### Why Calculation Core is isolated (future work)

Electricity/water tariff math is the core value of this application. It
must be independently testable and independently explainable — it should
not require an Express server, a database connection, or a browser to run
or verify. This is why the future Calculation Core will be plain
TypeScript functions with no dependency on `express`, HTML, or Supabase
client libraries. **This foundation task does not implement any
calculation logic** — it only reserves the boundary.

## 3. Request flow

```
User
 ↓
View (HTML + Bootstrap)
 ↓
Frontend TypeScript (api/ → controllers/ → views/)
 ↓
REST API  (fetch to /api/v1/...)
 ↓
Route            (backend/src/modules/<module>/<module>.routes.ts)
 ↓
Controller       (backend/src/modules/<module>/<module>.controller.ts)
 ↓
Service / Orchestrator   (backend/src/modules/<module>/<module>.service.ts)
 ├── Calculation Core (implemented, pure functions — backend/src/calculation/)
 ├── Repository (implemented for reads, and writes for Invoice — backend/src/repositories/)
 └── InvoiceUnitOfWork (implemented — backend/src/repositories/invoice-unit-of-work.ts,
     wraps the transactional write path for CreateInvoice)
          ↓
       PostgreSQL (Supabase)
```

Note: the Route → Controller chain above is still the intended shape for
a future domain endpoint (e.g. rooms, invoices) — no such Route/
Controller exists yet for those domains. Calculation Core, the
Repository layer, and now one complete Service (`CreateInvoiceService`,
`backend/src/modules/invoice/create-invoice.service.ts` — see
`docs/CREATE_INVOICE_WORKFLOW.md`) are implemented and independently
tested; `CreateInvoiceService` is not yet wired to a Controller/route,
since no CRUD/API task has run yet (see `docs/CALCULATION_CORE.md`,
`docs/DATABASE_ACCESS.md`).

Concrete example implemented in this foundation — the health check:

```
Browser
 ↓
frontend/src/controllers/status.controller.ts
 ↓ calls
frontend/src/api/health.api.ts  →  fetch("/api/v1/health")
 ↓
backend/src/modules/health/health.routes.ts
 ↓
backend/src/modules/health/health.controller.ts
 ↓
backend/src/modules/health/health.service.ts
 ↓
returns Result<HealthStatus> → Controller maps it to HTTP JSON
```

## 4. Dependency direction

Dependencies must only point "downward":

```
Route → Controller → Service → Business Module / Repository → Database
```

Explicitly forbidden directions (see `README.md` project rules):

- Repository → Controller
- Calculation → Express
- Calculation → Supabase
- Database → View

No circular dependencies are allowed between modules or layers. If two
modules seem to need each other, the shared logic should be extracted into
a third module both depend on, or the workflow should be re-modeled at the
Service layer.

## 5. REST boundary

- All backend endpoints are versioned under `/api/v1`.
- Requests and responses are JSON.
- Every response follows the success/error contract described in
  `docs/ERROR_HANDLING.md`.
- The frontend never assumes a response shape beyond that contract.

## 6. Database boundary

- The database is PostgreSQL, hosted by Supabase.
- Access is direct SQL via the **Postgres.js** client (no ORM) — see
  `docs/LEARNING_NOTES.md` and `docs/DATABASE_ACCESS.md` for why.
- All database access is isolated behind Repository interfaces
  (`backend/src/repositories/*.repository.ts`) with Postgres
  implementations under `backend/src/repositories/postgres/`. Controllers
  and Services never import Postgres.js directly, and Calculation Core
  never imports database code at all.
- The connection adapter (`backend/src/database/postgres-client.ts`) and
  the transaction boundary (`backend/src/database/transaction.ts`) are
  the only places a Postgres.js client is created — see
  `docs/DATABASE_ACCESS.md`.
- Schema: `database/migrations/001_initial_domain_schema.sql` and
  `002_preserve_invoice_item_precision.sql` — see `database/README.md`.

## 7. Why modules are intentionally small

A module here means "one responsibility, one clear input, one clear
output, one clear success/failure path" — not "one giant handler that does
everything." The project brief's example (`ValidateInvoiceInput`,
`LoadRoom`, `CalculateElectricityTax`, etc.) is the intended shape for
future invoice calculation work. Small modules are:

- Easier to unit test in isolation.
- Easier to explain individually during review or oral defense.
- Easier to change without breaking unrelated logic.

This is **not** implemented yet — this foundation only documents the
intended shape for when calculation work begins.

## 8. Module vs. Service — terminology used in this project

- **Module** (folder under `backend/src/modules/`): a business domain
  grouping (e.g. `health`, future `room`, `tariff`). Contains its own
  routes/controller/service/repository.
- **Service** (a `.service.ts` file inside a module): the orchestration
  layer for that module's workflows. "Service" always refers to this
  specific layer, not the module as a whole.

Calling a whole module a "service" (as in "microservice") would be
misleading in this project, since modules are not independently deployed.
