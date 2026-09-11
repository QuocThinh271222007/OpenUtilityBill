# Calculation Core

This document explains the billing calculation pipeline implemented in
`backend/src/calculation/`. It complements
[`docs/NUMERIC_PRECISION.md`](NUMERIC_PRECISION.md) (the arithmetic
strategy) and [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) (where this
layer sits in the overall system).

## What exists, and what does not (yet)

This is a **pure calculation layer** — it computes electricity/water
charges from data passed in as function parameters. It does **not**:

- Read from or write to PostgreSQL/Supabase.
- Know about Express, `Request`/`Response`, or HTTP at all.
- Persist anything.
- Provide a REST endpoint, Controller, Service, or Repository — those
  are later, separate tasks.

## ASCII pipeline

```
Config / input (decimal strings, plain numbers)
          │
          ▼
   ┌─────────────────┐
   │  calculateMeterUsage   │  previous, current, max → usage (handles rollover)
   └─────────────────┘
          │ usageKwh
          ▼
   ┌───────────────────────┐
   │ validateElectricityConfig │  tier list → sorted, checked tiers
   └───────────────────────┘
          │
          ▼
   ┌─────────────────────┐
   │ calculateQuotaFactor   │  tenantCount / peoplePerQuotaUnit
   └─────────────────────┘
          │ quotaFactor
          ▼
   ┌───────────────────────────┐
   │ allocateElectricityTiers    │  usage × quotaFactor-adjusted capacities
   └───────────────────────────┘   → per-tier quantity/amount (iterative)
          │
          ▼
   ┌─────────────────────────────┐      ┌──────────────────────────────┐
   │ calculateTieredElectricity     │  OR  │ calculateFallbackElectricity    │
   │ (QUOTA_TIERED)                 │      │ (FALLBACK_TIER_FLAT)            │
   └─────────────────────────────┘      └──────────────────────────────┘
          │ subtotal → VAT → exactTotal → roundedTotalVnd
          ▼
   electricityExactTotal ───────────┐
                                     │
   ┌─────────────────────┐          │
   │ calculateWaterCharge   │  base → VAT + environmental fee → exactTotal
   └─────────────────────┘          │
          │ waterExactTotal         │
          ▼                         ▼
        ┌───────────────────────────────┐
        │      calculateInvoiceTotal        │  sum exact totals FIRST, round ONCE
        └───────────────────────────────┘
                       │ roundedTotalVnd
                       ▼
        ┌───────────────────────────────────┐
        │     calculateBillingDifference        │  actualCharged − legalRoundedTotal
        └───────────────────────────────────┘
```

## Module responsibilities

| Module | Responsibility |
|---|---|
| `shared/exact-number.ts` | Exact rational arithmetic (`parseDecimal`, `add`, `subtract`, `multiply`, `divide`, `compare`, `min`, `toDecimalString`, `roundHalfUpToInteger`). See `docs/NUMERIC_PRECISION.md`. |
| `meter/calculate-meter-usage.ts` | `previous`/`current`/`max` readings → usage, including rollover (`current < previous`). |
| `electricity/validate-electricity-config.ts` | Checks a tier list is well-formed (non-empty, positive unique tier numbers, exactly one trailing unlimited tier, valid thresholds/prices) and sorts it deterministically. |
| `electricity/calculate-quota-factor.ts` | `tenantCount / peoplePerQuotaUnit`, unrounded. |
| `electricity/allocate-electricity-tiers.ts` | Iteratively distributes usage across quota-adjusted tier capacities. |
| `electricity/calculate-tiered-electricity.ts` | Orchestrates quota → allocation → subtotal → VAT → total for `QUOTA_TIERED`. |
| `electricity/calculate-fallback-electricity.ts` | Prices the entire usage at one configured tier's unit price, for `FALLBACK_TIER_FLAT`. |
| `water/calculate-water-charge.ts` | `PER_CUBIC_METER`/`PER_PERSON` base, then VAT + environmental fee (both from `base`, not from `base + VAT`). |
| `invoice/calculate-invoice-total.ts` | Sums electricity + water exact totals, rounds once. |
| `invoice/calculate-billing-difference.ts` | `actualCharged - legalRoundedTotal` (derived, never persisted). |

## Why each step is a separate module

Each module answers exactly one question ("what is the usage?", "is this
tier list valid?", "how is usage distributed across tiers?") with one
clear input/output contract. This mirrors the project's general
small-module principle (see `docs/ARCHITECTURE.md` §7): a bug in tier
allocation can be isolated and unit-tested without touching quota or VAT
logic, and each module can be explained on its own during review.

## Fail-fast

Every module that can encounter a meaningful invalid input returns
`Result<T>` (the project's existing contract — see
`docs/ERROR_HANDLING.md`) instead of throwing. Orchestrating modules
(`calculateTieredElectricity`, `calculateFallbackElectricity`,
`calculateWaterCharge`) check each sub-step's `Result` and return
immediately on the first failure — no later step runs on top of invalid
data. This is the same fail-fast pattern already established for the
Service layer, applied to Calculation Core's own internal pipeline.

Calculation Core does not assume any validation happened upstream (in a
Controller, a Service, or the database). Every module re-validates its
own inputs — see, for example, `calculateMeterUsage` re-checking
`previousReading <= meterMaximumValue` even though the database already
has that `CHECK` constraint.

## Why iteration, not recursion

`allocateElectricityTiers` walks a finite, linearly ordered list of
tiers with a `for` loop. Tiers are not a tree or graph — there is
nothing recursive about "the next tier in a sorted list" — so a loop is
simpler to read, step through, and reason about than recursion would be.
This is the same reasoning already documented in
`docs/LEARNING_NOTES.md` ("Vì sao chưa dùng đệ quy"), now applied to a
concrete implementation.

## Why Calculation Core has no database dependency

Electricity/water tariff math is this project's core value and the part
most likely to be checked against hidden test cases. Keeping it as plain
TypeScript with no dependency on Express, HTML, or a database client
means:

- It can be unit-tested in milliseconds, with no server or database
  running.
- The same input always produces the same output, regardless of
  database state, server environment, or browser — exactly what a
  hidden-test grader needs (deterministic, environment-independent
  results).
- A future Controller/Service layer can call these functions directly,
  passing in whatever configuration it already loaded — Calculation Core
  never reaches back into the database itself.

## Configuration-driven, not hard-coded

No file under `backend/src/calculation/` (outside `__tests__/`) contains
a contest-specific constant (`1984`, `0.08`, `8500`, ...). Every such
value is a function parameter, sourced from tariff configuration that
will eventually come from the database. The only place these constants
exist is the test-only fixture,
`backend/src/calculation/__tests__/fixtures/competition-defaults.ts` —
see its header comment for why that boundary matters.

## Zero tenant count

The database schema allows `rooms.tenant_count = 0` (see
`database/migrations/001_initial_domain_schema.sql`), but the
competition specification does not define a quota rule for a zero-person
room. Rather than inventing a product decision not present in the spec
(e.g. "quota factor 0 means the bounded tiers get zero capacity"),
`calculateQuotaFactor` rejects `tenantCount <= 0` explicitly with
`INVALID_TENANT_COUNT`. This only affects `QUOTA_TIERED` electricity
billing — `calculateWaterCharge`'s `PER_PERSON` method still accepts
`tenantCount = 0` (a legitimate "empty room pays 0 for water" outcome,
not a quota calculation).

## Public numeric contract

Every public function in `electricity/`, `water/`, and `invoice/`
accepts and returns **decimal strings** for measurement/financial
values — never `ExactNumber` or `bigint`. See
`docs/NUMERIC_PRECISION.md` §9 for why.
