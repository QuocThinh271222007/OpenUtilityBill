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
- **Calculation Core** (future work): pure TypeScript, independent of
  Express, HTML, and Supabase, so tariff/invoice math is independently
  testable.
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
| Database | PostgreSQL, hosted by Supabase (direct SQL, no ORM) |
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

The database schema has **not** been run against a live database yet (no
Supabase connection was available for this task). Calculation Core
(the actual billing formulas) and CRUD (Controllers/Services/Repositories
for these domains) still do not exist — these are separate, later,
reviewable tasks.

## Repository structure

```
OpenUtilityBill/
  backend/     Node.js + TypeScript + Express REST API, domain models
  frontend/    Vite + TypeScript + Bootstrap client
  database/    PostgreSQL schema (migrations/) and seed data (seeds/)
  docs/        Architecture, domain model, database, and learning docs
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
- [`docs/DOMAIN_MODEL.md`](docs/DOMAIN_MODEL.md) — business entities,
  relationships, and the historical-snapshot principle.
- [`docs/DATABASE_DESIGN.md`](docs/DATABASE_DESIGN.md) — schema
  reasoning: normalization, keys, constraints, `NUMERIC` vs. `FLOAT`.
- [`docs/TRANSACTIONS.md`](docs/TRANSACTIONS.md) — ACID guarantees and
  transaction boundaries for future write workflows.
- [`database/README.md`](database/README.md) — schema/seed files and how
  to run them.

## License

MIT — see [`LICENSE`](LICENSE).

Calculation rules for electricity/water billing will be implemented from
the official competition specification in a later task; none are
implemented in this repository yet.
