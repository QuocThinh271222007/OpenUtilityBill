# CreateInvoice workflow

This document explains `CreateInvoiceService`
(`backend/src/modules/invoice/create-invoice.service.ts`) and
`GetInvoiceService` (`backend/src/modules/invoice/get-invoice.service.ts`)
— the Service/Orchestrator layer behind the invoice REST API,
connecting the Repository layer, Calculation Core, and invoice
persistence into fail-fast pipelines. It complements
`docs/ARCHITECTURE.md`, `docs/DATABASE_ACCESS.md`,
`docs/TRANSACTIONS.md`, and `docs/API.md` (the HTTP contract these
Services are exposed through — `POST`/`GET /api/v1/invoices`).

## Sequence

```
1.  Validate input (roomId, billingPeriod, methods) -> VALIDATION_ERROR
2.  Load Room
3.  Check no invoice already exists for (roomId, billingPeriod)
4.  Load electricity MeterReading (always required)
5.  Load water MeterReading (only if waterBillingMethod = PER_CUBIC_METER)
6.  Load applicable ElectricityTariff + ordered tiers (by billingPeriod)
7.  Load applicable WaterTariff (by billingPeriod)
------------------------------------------------------------------ (no more I/O below)
8.  Calculate electricity meter usage (Calculation Core)
9.  Dispatch electricity calculation (QUOTA_TIERED | FALLBACK_TIER_FLAT)
10. Calculate water meter usage (if PER_CUBIC_METER) + water charge
11. Calculate invoice total (sum EXACT components, round ONCE)
12. If actualChargedAmount != null: calculate billing difference
13. Build invoice_items breakdown from the calculation results
------------------------------------------------------------------ (transaction starts here)
14. InvoiceUnitOfWork.run(...):
      insert invoice
      insert invoice_items
    (commit on success, rollback on any failure)
15. Return persisted invoice + items + full calculation breakdown
```

Any failed `Result` at any step returns immediately — no step after a
failure runs, and steps 8–13 (calculation) never overlap with database
I/O.

## Why reads/calculation happen before the transaction

Steps 2–7 (all Repository reads) and steps 8–13 (all Calculation Core,
pure functions, no I/O) run entirely **before** `InvoiceUnitOfWork.run`
is called. A PostgreSQL transaction holds a real database connection
open for its entire duration; holding one open while doing CPU-bound
calculation (or waiting on unrelated reads) would block that connection
for no reason and increase the chance of the transaction living longer
than necessary. The transaction therefore wraps **only** the two writes
that must be atomic — `createInvoice` and `createInvoiceItems` — see
`docs/DATABASE_ACCESS.md` "Transactions" for the same rule stated at
the mechanism level.

## Duplicate invoice / race condition

Two layers protect `UNIQUE(room_id, billing_period)`:

1. **Service pre-check** (step 3): `InvoiceRepository.findByRoomAndPeriod`
   — if an invoice already exists, the Service returns
   `INVOICE_ALREADY_EXISTS` immediately, before any calculation or write
   work happens. This is a normal-path optimization (fail fast, avoid
   wasted work) — it is **not** sufficient alone to prevent a duplicate
   under concurrency: two requests can both read "no invoice yet" before
   either has inserted.
2. **Real database constraint + error translation** (write phase):
   `PostgresInvoiceRepository.createInvoice` catches a `SQLSTATE 23505`
   (unique violation) from the actual `INSERT` and translates it to the
   same `INVOICE_ALREADY_EXISTS` code — this is the layer that actually
   prevents two concurrent requests from both succeeding. Whichever
   request's `INSERT` loses the race gets `INVOICE_ALREADY_EXISTS`, not
   a raw PostgreSQL error and not a silently-accepted duplicate.

No other PostgreSQL error code is special-cased — every other write
failure (a different constraint, a connection drop, ...) becomes the
generic `DATABASE_WRITE_FAILED`. This project does not build a general
SQLSTATE-to-domain-error framework; only the one mapping an actual use
case needs.

## Cross-table business invariants (Service-enforced, not database-enforced)

Migration 001 deliberately leaves several cross-table rules to the
Service layer (documented at the `invoices` table itself — see
`database/migrations/001_initial_domain_schema.sql`):

- `electricity_reading_id` must belong to the same room, same billing
  period, and be an `ELECTRICITY` reading.
- `water_reading_id`, when required (`PER_CUBIC_METER`), must belong to
  the same room, same billing period, and be a `WATER` reading; for
  `PER_PERSON` it must be `null`.
- The electricity/water tariff versions used must actually be effective
  for `billingPeriod`.

`CreateInvoiceService` satisfies all of these **by construction**, not
by validating a caller-supplied value: the caller never supplies a
`tariffId` or a `readingId` at all. The Service always looks up the
reading via `findByRoomPeriodAndUtility(roomId, billingPeriod,
utilityType)` and the tariff via `findApplicableTariffForPeriod(billingPeriod)`
— both keyed off `roomId`/`billingPeriod`, which the Service itself
validated. An API consumer cannot forge a reference to an unrelated
room's reading or a stale tariff version, because there is no input
field that would let it try.

## Room snapshot (tenant count)

`room.tenantCount` is read exactly **once** (step 2) and reused for
every purpose that needs it within the same execution: the electricity
quota factor (`QUOTA_TIERED`), `PER_PERSON` water pricing, and the
persisted `invoice.tenantCountUsed`. This guarantees the invoice's
snapshot always matches what was actually used to calculate it — see
`backend/src/modules/invoice/invoice.model.ts` "Why Invoice snapshots
configuration instead of referencing 'current' data" for why this
matters (a room's tenant count can change after an invoice is created;
the invoice must not silently change with it).

## How invoice_items are derived from Calculation Core

`buildInvoiceItemBreakdown` (`backend/src/modules/invoice/build-invoice-item-breakdown.ts`)
is a pure function — no I/O, no calculation of its own — that turns an
already-computed `TieredElectricityResult`/`FallbackElectricityResult`
and `WaterChargeResult` into a `NewInvoiceItem[]`, in this fixed,
deterministic order:

1. One `ELECTRICITY_TIER` row per applied tier (`QUOTA_TIERED`) — or
   exactly one `ELECTRICITY_TIER` row for the whole usage
   (`FALLBACK_TIER_FLAT`, at the tariff's configured
   `fallbackTierNumber`).
2. One `ELECTRICITY_VAT` row.
3. One `WATER_BASE` row (quantity = water usage in m³ for
   `PER_CUBIC_METER`, or the tenant count as a decimal string for
   `PER_PERSON`).
4. One `WATER_VAT` row.
5. One `WATER_ENVIRONMENTAL_FEE` row.

`displayOrder` is an incrementing integer assigned in that order — never
a hard-coded constant — so it stays unique and gap-free regardless of
how many electricity tiers a given tariff configuration actually
applies (a 3-tier and a 6-tier tariff both produce a valid, correctly
ordered breakdown).

## Why exact intermediate values are persisted

Every `amount`/`quantity`/`unitPrice` written to `invoice_items` is
copied **verbatim** from the Calculation Core result — never re-rounded
for storage. `invoice_items.quantity`/`.amount` are unconstrained
`NUMERIC` specifically because of this (see migration
`002_preserve_invoice_item_precision.sql`); rounding a breakdown line
just to fit a fixed scale would silently make the stored breakdown
inconsistent with the number that was actually used to compute the
invoice total. Only `invoice.calculatedTotal` (the single final
half-up-rounded VNĐ amount, from `calculateInvoiceTotal`) is rounded —
see `docs/NUMERIC_PRECISION.md` "sum exact, round once."

## actualChargedAmount / billing difference

When `actualChargedAmount` is supplied, the Service calls the existing
`calculateBillingDifference` (unchanged, Calculation Core) with the
already-computed `invoiceTotal.roundedTotalVnd` as the legal amount.
The result (`billingDifference`) is returned to the caller but **never
persisted** — `invoices` has no difference column by design (see
`backend/src/modules/invoice/invoice.model.ts` "Why there is no
differenceAmount field"): it is fully derived from
`calculatedTotal`/`actualChargedAmount`, which are the only two values
stored. When `actualChargedAmount` is `null`, `billingDifference` is
`null` — no comparison is attempted.

## actualChargedAmount scale corrective (write-boundary defect fixed)

Independent review found a real boundary defect: `invoices
.actual_charged_amount` is `NUMERIC(14, 2)`, but `CreateInvoiceService`
originally accepted **any** valid exact decimal string for
`actualChargedAmount` (e.g. `"367000.123456"`), computed
`billingDifference` from the *full* value, and only then persisted it —
letting PostgreSQL silently round the stored value to `"367000.12"`.
The returned `billingDifference` and the persisted
`invoice.actualChargedAmount` would then describe two different source
values — a correctness bug, not a display issue.

Fixed by validating `actualChargedAmount`'s *shape* in
`validateCreateInvoiceInput` (step 1, before any Repository read) —
`isValidActualChargedAmountScale`
(`backend/src/modules/invoice/invoice-input-validation.ts`): a
non-negative decimal string, at most 12 integer digits, at most 2
fractional digits (so it always fits `NUMERIC(14, 2)` exactly). Checked
by regex only — never `Number(...)`/`parseFloat(...)`. An invalid value
now fails with `VALIDATION_ERROR` before `roomRepository.findById` is
even called; migration 001 was **not** touched, and
`actual_charged_amount` was **not** widened — the column already
correctly represents "a final charged monetary amount," not an
intermediate calculation, so the fix belongs at the input boundary, not
the schema.

## GetInvoiceService — persisted readback, not recalculation

`GetInvoiceService` (`backend/src/modules/invoice/get-invoice.service.ts`)
answers `GET /api/v1/invoices?roomId=...&billingPeriod=...`. It:

1. Validates `roomId`/`billingPeriod` (same shape rules as
   `CreateInvoiceService`, factored into
   `invoice-input-validation.ts` so both Services share one
   implementation).
2. Calls `InvoiceRepository.findByRoomAndPeriod` — `null` → `INVOICE_NOT_FOUND`.
3. Calls `InvoiceRepository.findItemsByInvoiceId` (new Repository
   method, `ORDER BY display_order ASC` — never relies on PostgreSQL's
   natural row order).
4. If the persisted `invoice.actualChargedAmount` is not `null`, calls
   `calculateBillingDifference` against the persisted
   `calculatedTotal` — the **same** derived-not-stored rule as
   `CreateInvoiceService`, just computed from what was actually saved.

It does **not** call any electricity/water calculation function
(`calculateMeterUsage`, `calculateTieredElectricity`,
`calculateWaterCharge`, ...) — a historical invoice must return the
exact amount that was legally calculated and charged at creation time,
even if the room's tenant count or the active tariff version has since
changed (see "Room snapshot" above).

## Tests actually executed

- `CALCULATION_TESTS` (unchanged Calculation Core, 76/76 including the
  7 official cases), and all Repository/Service/HTTP unit tests (fake
  Repositories/UnitOfWork/Service, no PostgreSQL — including the
  `actualChargedAmount` scale corrective tests and the Controller tests
  using a fake `Request`/`Response`): these ran in this repository's
  local run and are `TEST_RUNTIME_EXECUTED` — see the REST API task's
  final report for the exact pass count.
- The write-path integration test
  (`backend/src/repositories/__tests__/postgres-invoice-unit-of-work.integration.test.ts`,
  covering both COMMIT and a genuine `UNIQUE(invoice_id, display_order)`
  rollback) and the real end-to-end API integration test
  (`backend/src/modules/invoice/__tests__/invoice.api.integration.test.ts`,
  a real Express app on an ephemeral port + built-in `fetch`, driving
  `POST` then `GET` through real PostgreSQL) are `TEST_IMPLEMENTED` and
  gated by `DATABASE_URL` — they `SKIP` (not fail) when it is unset. As
  with every other integration test in this project's history, no
  session so far has had a `DATABASE_URL` available, so these remain
  `TEST_IMPLEMENTED` only, not `TEST_RUNTIME_EXECUTED` — this project
  never reports a runtime PASS that was not actually observed (see
  `docs/DATABASE_ACCESS.md` "Transactions" for the same distinction
  applied to the earlier `runInTransaction` mechanism test).

## What is still deferred

- Full CRUD for `RentalProperty`/`Room`/`MeterReading`/
  `ElectricityTariff`/`WaterTariff` — only reads and this one
  `CreateInvoice` write path exist; no admin endpoints to manage them.
- `PropertyRepository` — no current read use case needs it.
- Invoice revision/versioning for the same (room, billingPeriod) — the
  `UNIQUE(room_id, billing_period)` constraint would need a schema
  change first (see `backend/src/modules/invoice/invoice.model.ts`
  "Invoice revision (future)").
- Any frontend, authentication, roles, admin UI, or Docker work — the
  REST API (`docs/API.md`) has no consumer yet and no access control.
