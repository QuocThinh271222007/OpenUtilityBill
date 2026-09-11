# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- CreateInvoice workflow: the first complete Service/Orchestrator write
  path, connecting Repository reads, Calculation Core, and transactional
  invoice persistence. `CreateInvoiceService`
  (`backend/src/modules/invoice/create-invoice.service.ts`) validates
  input, loads Room/MeterReading/Tariff data, dispatches
  QUOTA_TIERED/FALLBACK_TIER_FLAT electricity and
  PER_CUBIC_METER/PER_PERSON water calculation, sums exact components
  and rounds once for the final total, computes an optional
  actual-charged-amount difference, and persists the invoice + its full
  breakdown atomically. See `docs/CREATE_INVOICE_WORKFLOW.md` for the
  full sequence.
- Extended `InvoiceRepository` with write operations — `createInvoice`,
  `createInvoiceItems` — using dedicated `NewInvoice`/`NewInvoiceItem`
  input types (not `Omit<Invoice, ...>`/`Partial<Invoice>`). The
  Postgres implementation uses `INSERT ... RETURNING` so the returned
  domain object always reflects the actually-persisted row, and
  translates a `SQLSTATE 23505` unique-violation on `createInvoice`
  (the `UNIQUE(room_id, billing_period)` constraint) into
  `INVOICE_ALREADY_EXISTS` — the real race-condition guard behind the
  Service's own (necessary but not sufficient alone) pre-check.
- `InvoiceUnitOfWork` (`backend/src/repositories/invoice-unit-of-work.ts`,
  Postgres implementation
  `backend/src/repositories/postgres/postgres-invoice-unit-of-work.ts`):
  a small, single-method interface (`run(work)`) that lets
  `CreateInvoiceService` run `createInvoice`/`createInvoiceItems` inside
  one real transaction without importing Postgres.js,
  `DatabaseExecutor`, or `runInTransaction` itself — keeping the
  Service/Repository boundary intact.
- Unit tests for the new write repository methods (row mapping,
  `INSERT ... RETURNING` success, the SQLSTATE 23505 → 
  `INVOICE_ALREADY_EXISTS` mapping, generic write failure →
  `DATABASE_WRITE_FAILED`) and for `CreateInvoiceService` orchestration
  (hand-written fake Repositories/UnitOfWork, no PostgreSQL) — happy
  paths for both electricity methods and both water methods, duplicate
  invoice, missing readings, `tenantCount = 0`, meter rollover, and both
  branches of the `actualChargedAmount` comparison. A
  `DATABASE_URL`-gated integration test
  (`backend/src/repositories/__tests__/postgres-invoice-unit-of-work.integration.test.ts`)
  proves, against real PostgreSQL when available, both a full commit and
  a genuine rollback (a real `UNIQUE(invoice_id, display_order)`
  violation on the second `invoice_items` insert rolling back the
  already-inserted invoice and first item) — it `SKIP`s, and this has
  not yet been `TEST_RUNTIME_EXECUTED`, when `DATABASE_URL` is unset
  (see docs/CREATE_INVOICE_WORKFLOW.md "Tests actually executed").

No Express route, Controller, REST billing endpoint, or frontend work
is included in this change — see `docs/CREATE_INVOICE_WORKFLOW.md`
"What is still deferred".

### Added

- Database access foundation: added `postgres` (Postgres.js) as the
  PostgreSQL client — no ORM/query-builder. `backend/src/database/`:
  `postgres-client.ts` (single cached application-level client, no
  custom connection pool), `transaction.ts` (`runInTransaction`, a
  `Result`-returning wrapper around `sql.begin()`, designed to roll back
  on a failed `Result` and commit on a successful one — an integration
  test exercising this against real PostgreSQL is included and runs when
  `DATABASE_URL` is supplied; see "Tests" below for whether it has
  actually been executed), `database.types.ts`. Fail-fast `DATABASE_URL`
  loading in `backend/src/config/database.config.ts`.
- Read-only Repository layer (`backend/src/repositories/`): interfaces
  (`RoomRepository`, `MeterReadingRepository`,
  `ElectricityTariffRepository`, `WaterTariffRepository`,
  `InvoiceRepository`) with Postgres implementations under
  `repositories/postgres/`. Explicit, hand-written row-to-domain-model
  mapping (no automatic mapping library); parameterized queries only
  (zero `sql.unsafe` usage); tariff lookup fails clearly
  (`AMBIGUOUS_TARIFF_CONFIGURATION`) rather than guessing when more than
  one tariff version matches a billing period, since the schema does not
  prevent overlapping effective-date ranges. `PropertyRepository` and
  write operations (invoice creation) are deliberately not implemented —
  no current use case needs them yet.
- Verified, by reading `node_modules/postgres/src/types.js` (no parser
  registered for the `NUMERIC`/`BIGINT` type OIDs) and the library's own
  README (which states this explicitly), that Postgres.js returns both
  `NUMERIC` and `BIGINT` as exact decimal strings by default, with zero
  custom type configuration — matching the project's precision contract
  without introducing any risk of floating-point coercion. Integration
  tests proving this against a real PostgreSQL connection (including a
  fixed-scale `NUMERIC(p, s)` case matching the actual schema, e.g.
  `"0.0800"` not `"0.08"`) are included and run when `DATABASE_URL` is
  supplied; see "Tests" below for whether they have actually been
  executed in this repository's history so far.
- Changed all domain model ID fields (`RentalProperty.id`, `Room.id`,
  `Room.propertyId`, and every other `id`/`...Id` field across
  `backend/src/modules/*/*.model.ts`) from `number` to `string`, since
  every `id` column is `BIGINT` and a JS `number` cannot safely
  represent every possible `BIGINT` value. This matches Postgres.js's
  own default `BIGINT` handling, so no conversion happens in the
  Repository layer. Non-identity `INTEGER` columns (`tenantCount`,
  `tierNumber`, etc.) are unaffected.
- `docs/DATABASE_ACCESS.md`: Postgres.js vs. ORM, the Repository
  boundary, parameterized queries, connection lifecycle, transactions,
  the `NUMERIC`/`BIGINT` precision boundary, error translation, and what
  must vs. must not be treated as secret.
- Unit tests (no live database required) for config loading, row
  mapping, and error-semantics for every Repository. Integration tests
  (`*.integration.test.ts`) are implemented to prove, when run against
  real PostgreSQL, `NUMERIC`/`BIGINT` round-tripping (including
  fixed-scale columns), transaction rollback/commit, and repository
  reads against seeded data — these `skip` (not fail) when
  `DATABASE_URL` is unset, and have not yet been executed against a
  live database in this repository's history (see "Tests" below).

No CRUD, `CreateInvoiceService`, REST billing endpoints, or frontend
work are included in this change — see `docs/DATABASE_ACCESS.md`
"Deliberately deferred".

### Fixed

- Closed a precision mismatch between Calculation Core and the database:
  `invoice_items.quantity`/`.amount` were `NUMERIC(12,2)`/`NUMERIC(14,2)`
  (fixed to 2 decimal places), which could silently truncate exact
  intermediate values Calculation Core deliberately preserves (e.g. a
  quota-adjusted tier capacity of `62.5125` kWh). Added
  `database/migrations/002_preserve_invoice_item_precision.sql`,
  widening both columns to unconstrained `NUMERIC` (a safe, non-
  destructive `ALTER COLUMN ... TYPE`); `unit_price` and the invoices
  table's final rounded totals were deliberately left unchanged (see
  `docs/DATABASE_DESIGN.md` "Invoice item precision" for why). Added
  `database/validation/004_invoice_item_precision_validation.sql`
  proving PostgreSQL preserves 4-6 decimal-place values after the
  migration. Migration 001 was not modified.
- Removed an unnecessary internal round-trip: `calculateTieredElectricity`
  now calls the new `calculateQuotaFactorExact` (returns `ExactNumber`)
  directly instead of parsing back the string result of
  `calculateQuotaFactor`. Decimal strings remain for module/API/database
  boundaries only, not for communication between tightly-coupled internal
  calculation steps.
- Made the "quota configuration must yield a finite decimal" rule
  explicit and consistent: `calculateQuotaFactor`/`calculateQuotaFactorExact`
  now validate `peoplePerQuotaUnit` itself (via the new
  `isFiniteDecimalDenominator`) *before* dividing, independently of
  `tenantCount`. Previously, the same `peoplePerQuotaUnit` (e.g. `3`)
  could succeed or fail depending on which `tenantCount` it was applied
  to (e.g. `3/3` succeeded, `1/3` failed) - now it is rejected
  consistently for every `tenantCount`, which is more predictable and
  explainable for a tariff configuration. The official `peoplePerQuotaUnit
  = 4` case, and all values whose only prime factors are 2 and/or 5, are
  unaffected. All 7 official test cases remain unchanged and passing.
- Added `backend/src/calculation/__tests__/public-json-safety.test.ts`,
  verifying no public Calculation Core result object leaks a `bigint`
  (every public result `JSON.stringify`s successfully).

### Added

- Calculation Core (`backend/src/calculation/`): pure TypeScript billing
  calculation engine with no Express/database dependency. Exact
  `BigInt`-based rational arithmetic (`shared/exact-number.ts`) replaces
  floating-point for every financial value, so intermediate precision
  (e.g. quota-adjusted 62.5 kWh thresholds, 11192.4 VND VAT) is never
  lost before the single final half-up rounding step.
  - Meter usage, including rollover handling (`meter/`).
  - Configurable, data-driven electricity tier validation and iterative
    quota-adjusted allocation (`electricity/`), supporting both
    `QUOTA_TIERED` and `FALLBACK_TIER_FLAT` billing methods.
  - Water charge calculation for both `PER_CUBIC_METER` and
    `PER_PERSON` methods, with the environmental fee correctly computed
    from the base amount (not base + VAT).
  - Invoice totaling (sum exact totals, round once) and actual-charge
    difference comparison (derived, not persisted).
  - No contest-specific tariff constants anywhere in production
    calculation code — all configuration is a function parameter.
- `backend/src/calculation/__tests__/`: automated unit tests using
  Node's built-in `node:test` + `node:assert/strict` (run via `tsx`, no
  new test framework dependency), including all 7 officially published
  competition test cases and boundary tests for every documented
  constraint (`npm test` in `backend/`).
- `docs/CALCULATION_CORE.md` and `docs/NUMERIC_PRECISION.md` documenting
  the calculation pipeline and the exact-arithmetic strategy.

No CRUD, Repository, live Supabase connection, REST billing endpoint, or
frontend billing screens are included in this change — see
`docs/CALCULATION_CORE.md` for what is deliberately deferred.

### Fixed

- Corrected the Supabase SQL Editor runtime-validation execution model
  (test infrastructure, not the domain schema). The previous single
  file (`database/validation/001_domain_runtime_validation.sql`) relied
  on `SAVEPOINT`/`ROLLBACK TO SAVEPOINT` to recover from intentional
  constraint errors within one large pasted execution — but a SQL
  client that stops sending statements after the first error would
  never reach that `ROLLBACK TO SAVEPOINT`, breaking every test after
  it. Replaced with `database/validation/001_domain_success_validation.sql`
  (zero intentional errors, safe to run as one execution) and
  `database/validation/002_domain_constraint_validation.sql` (18
  independent, self-contained numbered blocks — `D1`–`D18` — each run
  separately, with its own setup and cleanup, so no block depends on a
  previous one having run or on the SQL client continuing after an
  error). Added `database/validation/003_validation_cleanup.sql` as a
  safety net that only ever deletes `VALIDATION_*`-prefixed rows.
- Corrected the competition tariff seed dates: electricity
  `effective_from` now cites the real legal date (2025-05-10, per
  Decision 1279/QĐ-BCT) with `effective_to = 2026-12-31` documented as
  bounding the seeded 8% VAT setting, not the underlying price; water
  `effective_from` (2026-09-06) is documented as the competition
  configuration's activation date, not a legal tariff date, with
  `effective_to` left `NULL`.
- Removed the derived `difference_amount` column/field from `invoices`
  and the `Invoice` model — it duplicated `actual_charged_amount -
  calculated_total` and risked going stale; it is now computed on
  demand instead of persisted.
- Added `UNIQUE (property_id, name)` to `rooms` so a room name is
  unambiguous within one property (not globally).
- Added `CHECK` constraints so `previous_reading`/`current_reading`
  cannot exceed a declared `meter_maximum_value`.
- Tightened `electricity_vat_rate`, `water_tariffs.vat_rate`, and
  `environmental_fee_rate` to `0 <= rate <= 1`, since rates are stored
  as decimal fractions (e.g. `0.08`, not `8`).

### Added

- Domain model and database foundation: TypeScript domain types for
  `RentalProperty`, `Room`, `MeterReading`, `ElectricityTariff`,
  `ElectricityTariffTier`, `WaterTariff`, `Invoice`, and `InvoiceItem`
  (`backend/src/modules/{property,room,meter-reading,tariff,invoice}/`).
- Initial PostgreSQL schema
  (`database/migrations/001_initial_domain_schema.sql`): all domain
  tables with foreign keys, `UNIQUE`/`CHECK` constraints, `NUMERIC`
  financial types, and deliberate `ON DELETE` policy per relationship.
- Official competition default tariff configuration as seed data
  (`database/seeds/001_competition_defaults.sql`): electricity VAT,
  people-per-quota-unit, fallback tier, 6 electricity tiers, and water
  pricing/VAT/environmental fee — stored as data, not hard-coded.
- `docs/DOMAIN_MODEL.md`, `docs/DATABASE_DESIGN.md`, and
  `docs/TRANSACTIONS.md` documenting entity responsibilities, schema
  reasoning, and ACID/transaction boundaries for future write workflows.

No calculation formulas, live database connection, or CRUD
(Controllers/Services/Repositories) are included in this change — see
`docs/TRANSACTIONS.md` and `docs/ARCHITECTURE.md` for what is
deliberately deferred.

- Project foundation: repository documentation (`README.md`,
  `THIRD_PARTY_NOTICES.md`, `docs/ARCHITECTURE.md`,
  `docs/LEARNING_NOTES.md`, `docs/ERROR_HANDLING.md`,
  `docs/DEVELOPMENT.md`).
- Backend foundation (`backend/`): Node.js + TypeScript + Express, with
  `app.ts`/`server.ts` separation, the shared `Result<T>` contract
  (`backend/src/shared/result.ts`), and a versioned health endpoint
  (`GET /api/v1/health`) demonstrating the Route → Controller → Service
  boundary.
- Frontend foundation (`frontend/`): Vite + TypeScript + Bootstrap client
  with a minimal `api/ → controllers/ → views/` structure that displays
  live backend status on the page.
- `database/README.md` documenting the intended future PostgreSQL
  (Supabase-hosted) schema and migration location.

No calculation, database schema, or CRUD features are included in this
change — see `docs/ARCHITECTURE.md` for what is deliberately deferred.
