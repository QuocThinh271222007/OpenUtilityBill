# OpenUtilityBill

Open-source web application for transparent electricity and water cost
calculation and comparison for rental housing.

## Problem statement

Rental tenants frequently cannot verify how their electricity/water bills
are calculated (tier allocation, quota rules, taxes/fees applied by the
landlord). OpenUtilityBill aims to make that calculation transparent,
explainable, and independently checkable.

## Goals

- Calculate electricity and water costs from meter readings and published
  tariff structures.
- Explain each step of a bill's calculation, not just the final amount.
- Allow comparison between billing periods or tariff scenarios.

This is an individual entry for the 2026 Open Source Software Team
Selection Contest. Every architectural and implementation decision is
expected to be personally understood, explained, and defended by the
repository owner — see `docs/LEARNING_NOTES.md`.

## Architecture summary

- **Modular Monolith**: one deployable backend, internally organized into
  small business-domain modules.
- **MVC-oriented**, extended with a Service/Orchestrator layer and a
  Repository layer that isolates database access.
- **Calculation Core**: pure TypeScript, independent of Express, HTML,
  and Supabase — meter usage, tiered/fallback electricity, water, and
  invoice-total math, implemented and independently unit-tested (see
  [`docs/CALCULATION_CORE.md`](docs/CALCULATION_CORE.md)).
- **Result contract**: business logic returns `{ success, data }` or
  `{ success: false, error: { code, message } }` instead of throwing or
  returning `false`, enabling fail-fast error propagation.

Full details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Technology stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, TypeScript, Vite, Bootstrap |
| Backend | Node.js, TypeScript, Express |
| API | REST, JSON, versioned under `/api/v1` |
| Database | PostgreSQL, hosted by Supabase (direct SQL via Postgres.js, no ORM) |
| Source control | Git, Conventional Commits |

See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for the exact
third-party packages in use and their licenses.

## Current development status

Foundation stage: repository structure, documentation, a minimal frontend
page, a backend `GET /api/v1/health` endpoint, and now the domain model
and database foundation — TypeScript domain types
(`RentalProperty`, `Room`, `MeterReading`, `ElectricityTariff`,
`ElectricityTariffTier`, `WaterTariff`, `Invoice`, `InvoiceItem`), an
initial PostgreSQL schema, and the official competition default
tariff configuration as seed data. See
[`docs/DOMAIN_MODEL.md`](docs/DOMAIN_MODEL.md) and
[`docs/DATABASE_DESIGN.md`](docs/DATABASE_DESIGN.md).

Calculation Core is now implemented and independently tested: meter
usage (including rollover), configurable quota-adjusted tier allocation,
both electricity billing methods (`QUOTA_TIERED`, `FALLBACK_TIER_FLAT`),
both water billing methods (`PER_CUBIC_METER`, `PER_PERSON`), invoice
totaling, and actual-charge comparison — all pure TypeScript, using
exact `BigInt`-based rational arithmetic (never floating-point) for
every financial value, with no database or HTTP dependency. See
[`docs/CALCULATION_CORE.md`](docs/CALCULATION_CORE.md) and
[`docs/NUMERIC_PRECISION.md`](docs/NUMERIC_PRECISION.md).

A persistence foundation now exists: a Postgres.js database adapter and
transaction boundary (`backend/src/database/`), and Repository
implementations for `RentalProperty`, `Room`, `MeterReading`,
`ElectricityTariff` (with its tiers), `WaterTariff`, and `Invoice` —
every one of these now supports both read AND write
(`backend/src/repositories/`) — all parameterized SQL, no ORM,
`NUMERIC` and `BIGINT` preserved as exact strings end to end. See
[`docs/DATABASE_ACCESS.md`](docs/DATABASE_ACCESS.md).

The invoice write workflow is implemented: `CreateInvoiceService`
(`backend/src/modules/invoice/`) orchestrates Room/MeterReading/Tariff
reads, Calculation Core, and a transactional `InvoiceUnitOfWork` to
persist an invoice and its full breakdown atomically, with
race-condition-safe duplicate protection. `GetInvoiceService` reads a
persisted invoice back (no recalculation). See
[`docs/CREATE_INVOICE_WORKFLOW.md`](docs/CREATE_INVOICE_WORKFLOW.md).

The full mandatory backend REST API now exists: invoice creation/
readback (`POST`/`GET /api/v1/invoices`) plus management endpoints for
properties, rooms, meter readings, and electricity/water tariff
configuration (`docs/MANAGEMENT_API.md`) — enough for a future frontend
to manage all required data and create/inspect invoices. Every endpoint
is wired Route → Controller → Service with no business logic or SQL in
the Controller, and each module has its own lazy composition root
(`backend/src/composition/`) so `GET /api/v1/health` keeps working with
no `DATABASE_URL` set. DELETE is deliberately not implemented for any
resource yet (see `docs/MANAGEMENT_API.md` "No DELETE endpoints"). See
[`docs/API.md`](docs/API.md) and
[`docs/MANAGEMENT_API.md`](docs/MANAGEMENT_API.md).

The full mandatory browser UI now exists: a Vite + TypeScript +
Bootstrap single-page app (`frontend/src/`) with a hand-written
hash-based router (no router library), covering the complete workflow —
create/edit properties and rooms, set tenant count, enter and inspect
monthly electricity/water readings, configure electricity (dynamic
tiers, any count) and water tariffs, create an invoice and see its full
breakdown, supply an actual charged amount and see the legal-vs-actual
comparison, and re-open an already-created historical invoice. The
frontend never computes billing money — every financial/measurement
value is handled as a `string` end to end, matching the backend's own
`NUMERIC`-as-string contract, and display-only VND formatting is done
by string manipulation, never by converting through a JS `number`. See
[`docs/FRONTEND.md`](docs/FRONTEND.md).

Authentication, roles, an admin UI, and a production deployment still
do not exist — these are separate, later, reviewable tasks.

## Repository structure

```
OpenUtilityBill/
  backend/     Node.js + TypeScript + Express REST API, domain models,
               Calculation Core (backend/src/calculation/), database
               adapter (backend/src/database/), Repository layer
               (backend/src/repositories/), and the composition root
               that wires real Services to real Repositories
               (backend/src/composition/)
  frontend/    Vite + TypeScript + Bootstrap client — api/ (REST
               calls), types/ (wire-contract mirrors), utils/ (pure
               display/precision helpers), controllers/ (per-screen
               orchestration), views/ (DOM rendering), and a small
               hand-written hash router (frontend/src/controllers/
               navigation.controller.ts)
  database/    PostgreSQL schema (migrations/), seed data (seeds/), and
               runtime validation SQL (validation/)
  docs/        Architecture, domain model, database access, calculation,
               API/management API, and learning docs
```

## Quick start

See [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) for install, run, build,
and typecheck commands for both `backend/` and `frontend/`.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — architecture, request
  flow, dependency direction, module boundaries.
- [`docs/LEARNING_NOTES.md`](docs/LEARNING_NOTES.md) — reasoning behind
  each technology and architectural decision (Vietnamese).
- [`docs/ERROR_HANDLING.md`](docs/ERROR_HANDLING.md) — success/failure
  contract, error codes, fail-fast pipeline.
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — setup and commands.
- [`docs/FRONTEND.md`](docs/FRONTEND.md) — frontend architecture,
  screen/navigation map, the API-client boundary, financial-string
  rule, month↔billingPeriod conversion, and what was actually
  runtime-tested.
- [`docs/DOMAIN_MODEL.md`](docs/DOMAIN_MODEL.md) — business entities,
  relationships, and the historical-snapshot principle.
- [`docs/DATABASE_DESIGN.md`](docs/DATABASE_DESIGN.md) — schema
  reasoning: normalization, keys, constraints, `NUMERIC` vs. `FLOAT`.
- [`docs/TRANSACTIONS.md`](docs/TRANSACTIONS.md) — ACID guarantees and
  transaction boundaries for future write workflows.
- [`docs/CALCULATION_CORE.md`](docs/CALCULATION_CORE.md) — the billing
  calculation pipeline, module responsibilities, fail-fast design.
- [`docs/NUMERIC_PRECISION.md`](docs/NUMERIC_PRECISION.md) — why exact
  `BigInt`-based rational arithmetic is used instead of floating-point.
- [`docs/DATABASE_ACCESS.md`](docs/DATABASE_ACCESS.md) — Postgres.js,
  the Repository boundary, parameterized queries, transactions, and the
  `NUMERIC`/`BIGINT` precision boundary at the database adapter.
- [`docs/CREATE_INVOICE_WORKFLOW.md`](docs/CREATE_INVOICE_WORKFLOW.md) —
  the `CreateInvoiceService`/`GetInvoiceService` sequence: reads,
  calculation, transactional write, duplicate/race protection, invoice
  snapshot principle, persisted readback.
- [`docs/API.md`](docs/API.md) — REST contract for
  `POST`/`GET /api/v1/invoices`: request/response shape, the
  `YYYY-MM-DD` date wire format, decimal-string financial contract,
  HTTP status mapping, and the lazy database composition.
- [`docs/MANAGEMENT_API.md`](docs/MANAGEMENT_API.md) — REST contract
  for property/room/meter-reading/tariff management: numeric/date
  contracts per resource, duplicate/overlap protection, historical
  reference protection (why a referenced meter reading or tariff can't
  be edited), and why DELETE is not implemented.
- [`database/README.md`](database/README.md) — schema/seed files and how
  to run them.

## License

MIT — see [`LICENSE`](LICENSE).

Calculation Core implements the official competition billing rules
(meter usage, tiered/fallback electricity, water, invoice totals) and is
covered by automated tests against the official published test cases
(`cd backend && npm test`). A Repository layer over Postgres.js exists
with read+write support for every domain (RentalProperty, Room,
MeterReading, ElectricityTariff, WaterTariff, Invoice); a complete
`CreateInvoiceService`/`GetInvoiceService` pair ties invoice creation/
readback together transactionally; the full mandatory REST API (invoice
workflow plus property/room/meter-reading/tariff management) exposes
that through real endpoints (see `docs/API.md`, `docs/MANAGEMENT_API.md`);
and a Vite + TypeScript + Bootstrap browser UI (`docs/FRONTEND.md`)
consumes that API end to end for the full mandatory workflow. DELETE,
authentication, and a production deployment are not implemented yet.
