# Management API

This document is the REST contract for the backend management
endpoints — rental properties, rooms, meter readings, and tariff
(electricity + water) configuration. It complements `docs/API.md`
(the invoice workflow endpoints and shared conventions: base path,
ID/decimal-string contract, success/error contract) — read that
document first; this one only covers what is specific to management.

**No frontend consumes this API yet.** These endpoints exist so a
future frontend can create/edit properties and rooms, set tenant
count, enter and inspect meter readings, and configure tariffs, then
call the existing `POST`/`GET /api/v1/invoices` — implementing that
frontend is a separate, later task.

## Endpoints

| Resource | List | Create | Update | Delete |
|---|---|---|---|---|
| Properties | `GET /api/v1/properties` | `POST /api/v1/properties` | `PATCH /api/v1/properties/:propertyId` | not implemented |
| Rooms | `GET /api/v1/rooms` (`?propertyId=` optional) | `POST /api/v1/rooms` | `PATCH /api/v1/rooms/:roomId` | not implemented |
| Meter readings | `GET /api/v1/meter-readings?roomId=` (`&billingPeriod=` optional) | `POST /api/v1/meter-readings` | `PUT /api/v1/meter-readings/:readingId` | not implemented |
| Electricity tariffs | `GET /api/v1/tariffs/electricity` | `POST /api/v1/tariffs/electricity` | `PUT /api/v1/tariffs/electricity/:tariffId` | not implemented |
| Water tariffs | `GET /api/v1/tariffs/water` | `POST /api/v1/tariffs/water` | `PUT /api/v1/tariffs/water/:tariffId` | not implemented |

## No DELETE endpoints (by design)

Rooms, meter readings, tariffs, and invoices form historical financial
data relationships with `RESTRICT` foreign keys (see migration 001).
Blind CRUD delete semantics would require product decisions this
project has not made: deletion vs. archive, what happens to historical
integrity when a referenced row is removed, whether a delete needs to
be recoverable. None of those decisions are required for the mandatory
contest scope, so DELETE is **deliberately not implemented** anywhere
in this API — `DELETE_NOT_IMPLEMENTED_BY_DESIGN=true`. This is a
management API for the fields the mandatory scope needs, not a claim of
generic full CRUD.

## PATCH vs. PUT

Properties and rooms use `PATCH` (partial update — only the fields
present in the body change). Meter readings and tariffs use `PUT` (full
replacement — the entire resource is re-specified), because a partial
edit to a meter reading or a tariff's `tiers` array could easily create
an inconsistent combination (e.g. changing only `currentReading` without
re-checking it against an existing `meterMaximumValue`).

## Properties

### `POST /api/v1/properties`

```json
{ "name": "Khu trọ A", "address": "123 Đường X" }
```

`address` may be `null`. Both `name` and `address` are trimmed;
`PropertyManagementService` normalizes an empty/whitespace-only
`address` (after trim) to `null` — an empty string and "no address"
are the same thing, and the API does not keep two representations of
it. `name` must not be empty after trim (`VALIDATION_ERROR`
otherwise). Response `201`.

### `GET /api/v1/properties`

Returns all properties, `ORDER BY id ASC` (deterministic — see
`PropertyRepository.listAll`).

### `PATCH /api/v1/properties/:propertyId`

```json
{ "name": "Tên mới" }
```

At least one of `name`/`address` must be present (`VALIDATION_ERROR`
otherwise). `PROPERTY_NOT_FOUND` (`404`) when the id doesn't exist.

## Rooms

### `POST /api/v1/rooms`

```json
{ "propertyId": "1", "name": "101", "tenantCount": 4 }
```

`propertyId` must reference an existing property
(`PROPERTY_NOT_FOUND`, checked before the write) — the Service does not
rely on the foreign key failing to report this, since a clear
not-found is more useful than a generic write error. `tenantCount` must
be a JSON number that is a non-negative integer (`VALIDATION_ERROR`
otherwise — never `Number(...)`-coerced from a string). Response `201`.

### `GET /api/v1/rooms` / `GET /api/v1/rooms?propertyId=1`

`ORDER BY id ASC`. Without `propertyId`, returns every room across
every property.

### `PATCH /api/v1/rooms/:roomId`

```json
{ "tenantCount": 5 }
```

`propertyId` is **immutable** on `PATCH` — it does not appear in the
update body's accepted fields at all. Moving a room between properties
would introduce historical-reference questions (what happens to its
past meter readings/invoices?) with no current requirement to justify
the added complexity, so it is out of scope.

### Duplicate room name protection

`UNIQUE(property_id, name)` (migration 001) means a room name only has
to be unique **within** one property — the same name in two different
properties is fine. A violation on `create`/`PATCH` (renaming into a
collision) is translated to `ROOM_ALREADY_EXISTS` (`409`), never a raw
constraint error.

### Tenant count semantics — current state, not historical

`Room.tenantCount` is the room's **current** state. `PATCH`-ing it
changes only that current value — it never rewrites any past invoice.
`Invoice.tenantCountUsed` is the immutable historical snapshot taken at
the moment that invoice was created (see
`backend/src/modules/invoice/invoice.model.ts` "Why Invoice snapshots
configuration" and `docs/CREATE_INVOICE_WORKFLOW.md` "Room snapshot").
`RoomManagementService` never reads or writes the `invoices` table at
all — this invariant holds simply because no code path here does the
opposite, not because of an explicit guard.

## Meter readings

### `POST /api/v1/meter-readings`

```json
{
  "roomId": "1",
  "billingPeriod": "2026-09-01",
  "utilityType": "ELECTRICITY",
  "previousReading": "0",
  "currentReading": "120",
  "meterMaximumValue": null
}
```

`billingPeriod` uses the **same strict `"YYYY-MM-DD"`, first-of-month**
wire contract as invoices (`docs/API.md` "Date contract") — meter
readings are billing-period-scoped data, unlike tariff effective dates
(see "Tariff effective dates" below). `utilityType` is `"ELECTRICITY"`
or `"WATER"`. Response `201`.

### Numeric contract (`NUMERIC(12, 2)`)

`previousReading`, `currentReading`, and `meterMaximumValue` (when not
`null`) must be non-negative decimal strings with **at most 10 integer
digits and 2 fractional digits** — matching `meter_readings`'s declared
`NUMERIC(12, 2)` columns exactly, so nothing is silently rounded on
write (the same class of defect fixed for invoices' `actualChargedAmount`
— see `docs/CREATE_INVOICE_WORKFLOW.md` "actualChargedAmount scale
corrective"). Never `Number(...)`/`parseFloat(...)`/`Math.round(...)`.

| Value | Result |
|---|---|
| `"0"`, `"120"`, `"120.5"`, `"120.50"`, `"9999999999.99"` | valid |
| `"-1"`, `"12.345"`, `"10000000000"`, `"abc"` | `400 VALIDATION_ERROR` |

### Rollover / reading-combination validity — reused, not reimplemented

After the shape check above, `MeterReadingManagementService` calls the
**existing** `calculateMeterUsage` (Calculation Core,
`backend/src/calculation/meter/calculate-meter-usage.ts`) with the
submitted `previousReading`/`currentReading`/`meterMaximumValue`, and
discards the computed usage — it only needs to know whether the
combination is valid (non-negative, `meterMaximumValue` positive when
given, readings `<= meterMaximumValue`, rollover only accepted when
`meterMaximumValue` is present). This is the exact same function
`CreateInvoiceService` uses to compute real billing usage, so a reading
accepted here is guaranteed usable by billing later — no second,
possibly-divergent implementation of the rollover rule exists.

### `GET /api/v1/meter-readings?roomId=1` / `&billingPeriod=2026-09-01`

Returns reading history for a room, `ORDER BY billing_period DESC,
utility_type ASC, id ASC` — deterministic, never PostgreSQL's natural
row order. The optional `billingPeriod` filter narrows to one period.

### `PUT /api/v1/meter-readings/:readingId`

Full replacement — the same body shape as `POST`. Re-validated the same
way (shape, then `calculateMeterUsage`).

### Historical reference protection

Before writing a `PUT`, the Service checks
`MeterReadingRepository.isReferencedByInvoice(id)` — `true` when this
reading is any invoice's `electricity_reading_id` **or**
`water_reading_id`. If so, the update is rejected with
`METER_READING_IN_USE` (`409`). A meter reading that has already been
used to legally calculate and persist a charged invoice must not
silently change underneath that invoice — the invoice's evidentiary
value depends on its source reading staying exactly what it was when
the invoice was created. (`UNIQUE(room_id, billing_period,
utility_type)` violations on `create`/`PUT` are separately translated
to `METER_READING_ALREADY_EXISTS`, `409`.)

## Electricity tariffs

Electricity tariff configuration is an **aggregate**: one
`electricity_tariffs` parent row plus N `electricity_tariff_tiers`
child rows (data-driven — any number of tiers, no assumption of
exactly 6). `create`/`update` write both atomically.

### `POST /api/v1/tariffs/electricity`

```json
{
  "name": "Biểu giá điện tháng 10/2026",
  "effectiveFrom": "2026-10-01",
  "effectiveTo": null,
  "electricityVatRate": "0.08",
  "peoplePerQuotaUnit": 4,
  "fallbackTierNumber": 3,
  "tiers": [
    { "tierNumber": 1, "thresholdKwh": "50", "unitPrice": "1984" },
    { "tierNumber": 6, "thresholdKwh": null, "unitPrice": "3460" }
  ]
}
```

No production default values — every price/rate/threshold in this
example is illustrative input data, not a constant baked into
production code (see "No hard-coded tariff constants" below). Response
`201`, body includes the created tariff and its tiers (same shape as
`GET`).

### `GET /api/v1/tariffs/electricity`

Every tariff version, each with its ordered tiers:
`ORDER BY effective_from DESC, id DESC` for tariffs, `ORDER BY
tier_number ASC` for each tariff's tiers.

```json
{
  "success": true,
  "data": [
    {
      "tariff": { "id": "1", "name": "...", "effectiveFrom": "2025-05-10", "effectiveTo": "2026-12-31", "electricityVatRate": "0.0800", "peoplePerQuotaUnit": 4, "fallbackTierNumber": 3, "createdAt": "2026-01-01T00:00:00.000Z" },
      "tiers": [ { "id": "1", "tariffId": "1", "tierNumber": 1, "thresholdKwh": "50.00", "unitPrice": "1984.00" } ]
    }
  ]
}
```

`electricityVatRate`/`thresholdKwh`/`unitPrice` may come back at the
column's declared `NUMERIC` scale (e.g. `"0.0800"`, `"50.00"`) — the
same exact value, not reformatted (see `docs/API.md` "Financial
values").

### `PUT /api/v1/tariffs/electricity/:tariffId`

Full replacement of the parent **and** the entire tier set: `name`,
`effectiveFrom`, `effectiveTo`, `electricityVatRate`,
`peoplePerQuotaUnit`, `fallbackTierNumber`, `tiers` (same body shape as
`POST`). Only allowed when the tariff is not referenced by any invoice
— see "Historical tariff protection" below.

### Electricity tariff aggregate transaction

`ElectricityTariffManagementService.create`/`update` both write through
`ElectricityTariffUnitOfWork.run(...)` — a small, single-method
interface modeled directly on `InvoiceUnitOfWork`
(`backend/src/repositories/invoice-unit-of-work.ts`). Inside one real
PostgreSQL transaction:

```
create:  INSERT electricity_tariffs (parent)
         INSERT electricity_tariff_tiers (each tier)

update:  UPDATE electricity_tariffs (parent, full replacement)
         DELETE electricity_tariff_tiers WHERE tariff_id = :id
         INSERT electricity_tariff_tiers (each new tier)
```

Any failure at any step rolls back everything — there is no state where
the parent is written but the tiers are only half-written, or where
`update` leaves a mix of old and new tiers. See
`backend/src/repositories/postgres/postgres-electricity-tariff-unit-of-work.ts`.

### Rate / quota / fallback-tier validation — reused, not reinvented

- **Tier structure** (non-empty, positive/unique `tierNumber`, exactly
  one unbounded tier and it must be last): delegated entirely to the
  **existing** `validateElectricityConfig`
  (`backend/src/calculation/electricity/validate-electricity-config.ts`)
  — the same function `CreateInvoiceService` uses. No second copy of
  these rules exists.
- **`electricityVatRate`**: must be an exact decimal string in `[0, 1]`
  with at most 4 fractional digits (matches `NUMERIC(5, 4)`) — compared
  using the Calculation Core's own exact-decimal primitives
  (`parseDecimal`/`compare`/`ZERO`/`ONE`,
  `backend/src/modules/tariff/tariff-rate-validation.ts`), never
  `Number(...)`.
- **`peoplePerQuotaUnit`**: validated by calling the **existing**
  `calculateQuotaFactor` with `tenantCount = 1` (a safe positive probe
  value, not a real room) — this reuses the project's actual rule that
  `peoplePerQuotaUnit` must produce a finite decimal quota factor for
  every tenant count (only prime factors 2 and/or 5), rather than
  inventing a second, possibly looser rule for admin input. An invalid
  value fails with `INVALID_PEOPLE_PER_QUOTA_UNIT`, propagated
  unchanged from Calculation Core.
- **`fallbackTierNumber`**: must equal some submitted tier's
  `tierNumber`, checked explicitly at write time
  (`TARIFF_CONFIGURATION_INVALID` otherwise) — `CreateInvoiceService`
  is not the first place this mismatch is discovered.

### Tier numeric contract

- `thresholdKwh` (nullable): `NUMERIC(12, 2)` — at most 10 integer
  digits, 2 fractional digits, positive when present.
- `unitPrice`: `NUMERIC(14, 2)` — at most 12 integer digits, 2
  fractional digits, non-negative.

Both checked by shape (regex), never coerced through `Number(...)`.

## Water tariffs

`water_tariffs` is a single table (no tier aggregate), so `create`/
`update` are one `INSERT`/`UPDATE` each — no Unit of Work needed.

### `POST /api/v1/tariffs/water`

```json
{
  "name": "Biểu giá nước 2026",
  "effectiveFrom": "2026-10-01",
  "effectiveTo": null,
  "pricePerCubicMeter": "8500",
  "pricePerPerson": "80000",
  "vatRate": "0.05",
  "environmentalFeeRate": "0.10"
}
```

- `pricePerCubicMeter`/`pricePerPerson`: `NUMERIC(14, 2)` — at most 12
  integer digits, 2 fractional digits, non-negative.
- `vatRate`/`environmentalFeeRate`: `NUMERIC(5, 4)` — exact decimal in
  `[0, 1]`, at most 4 fractional digits (same validation helper as
  electricity's `electricityVatRate`).

Response `201`.

### `GET /api/v1/tariffs/water`

`ORDER BY effective_from DESC, id DESC`.

### `PUT /api/v1/tariffs/water/:tariffId`

Full replacement (same body shape as `POST`). Only allowed when the
tariff is not referenced by any invoice.

## Tariff effective dates — a different date rule than billingPeriod

`effectiveFrom`/`effectiveTo` use the strict `"YYYY-MM-DD"` shape
(rejects malformed strings, non-existent calendar dates, and timestamps
with a time component) but — unlike `billingPeriod` — **do not** require
the day to be `01`. The seeded competition electricity tariff's real
`effectiveFrom` is `"2025-05-10"` (the actual legal effective date per
Decision 1279/QĐ-BCT); forcing day-01 here would reject genuinely valid
tariff data.

This is implemented as two small, shared pure functions in
`backend/src/shared/http/date-wire-format.ts`:
`parseDateWireFormat` (any valid calendar date — used for
`effectiveFrom`/`effectiveTo`) and `parseFirstOfMonthWireFormat` (adds
the day-01 check — used for `billingPeriod`, and re-exported unchanged
from `backend/src/modules/invoice/invoice.http.ts` as
`parseBillingPeriodWireFormat` so the invoice module's existing imports
and tests did not need to change).

## Tariff period overlap validation

Before `create`/`update`, both `ElectricityTariffManagementService` and
`WaterTariffManagementService` check whether the submitted
`effectiveFrom`/`effectiveTo` range overlaps any *other* tariff version
of the same type (excluding the tariff being updated, on `update`).
Overlap is defined as: `A.effectiveFrom <= B.effectiveTo AND
B.effectiveFrom <= A.effectiveTo`, with a `null` `effectiveTo` treated
as unbounded future. A conflict returns `TARIFF_PERIOD_OVERLAP` (`409`).

This is **application-level** validation
(`backend/src/modules/tariff/tariff-period-overlap.ts`, shared by both
Services) — the current schema (migration 001, unchanged in this task)
has no `EXCLUDE` constraint for this, and adding one is out of scope
here. It is normal admin-level conflict prevention, not a database
guarantee: no `SERIALIZABLE` isolation or advisory lock was introduced
to close the gap between the check and the write. `CreateInvoiceService`
keeps its own independent, fail-closed second line of defense — if
overlapping tariff data exists regardless (created before this
validation existed, or inserted directly via SQL), invoice creation for
an ambiguous period still fails loudly
(`AMBIGUOUS_TARIFF_CONFIGURATION`) instead of silently picking one.

## Historical tariff protection

Before a `PUT` on either tariff type, the Service checks whether any
invoice references the tariff (`electricity_tariff_id` or
`water_tariff_id`). If so, the update is rejected with `TARIFF_IN_USE`
(`409`). Editing a tariff version already used by a historical invoice
would silently change what "this invoice used tariff version X" means
— the fix is to create a **new** tariff version (a new effective-date
range), not edit an old one. This is the same historical-snapshot
principle documented for `Room.tenantCount`/`Invoice.tenantCountUsed`
above, applied to tariffs.

## No hard-coded tariff constants

None of the values from the competition's seed data (`1984`, `2050`,
`2380`, `2998`, `3350`, `3460`, `8500`, `80000`, `0.08`, `0.05`,
`0.10`, ...) appear anywhere in the management Services/Controllers/
Repositories — every price, rate, threshold, and quota configuration
value is supplied by the request body and persisted as-is. The example
JSON bodies in this document use those values only as realistic
illustrations.

## Architecture notes specific to management

- **Composition roots**: `backend/src/composition/{property,room,meter-reading,tariff}.composition.ts`
  — one file per module, same lazy pattern as
  `invoice.composition.ts` (`docs/API.md` "Composition / dependency
  wiring"): `getDatabaseClient()` is called only inside each factory
  function, never at module-import time, so `GET /api/v1/health` keeps
  working with no `DATABASE_URL`, and a malformed management request
  still returns `400` before any database dependency is touched.
- **Shared HTTP utilities**: `backend/src/shared/http/` now holds
  `date-wire-format.ts`, `result-error-status.ts`, and
  `controller-helpers.ts` (the `isPlainRequestBody`/
  `sendValidationError`/`sendInternalError` trio every Controller in
  this API uses) — extracted from the invoice module during this task
  so five modules do not each carry a near-duplicate copy. Invoice
  behavior is unchanged; its own files re-export these where existing
  imports needed to keep working.
- **Shared validation primitives**: `backend/src/shared/validation/`
  (`id.ts` — BIGINT id shape; `date.ts` — first-of-month check;
  `decimal-scale.ts` — generic "exact decimal within N/M digits" check
  used for every `NUMERIC(p, s)` field in this API).
- **`backend/src/database/unique-violation.ts`**: the SQLSTATE 23505
  structural check, extracted from `PostgresInvoiceRepository` (which
  originally had the only copy) so `PostgresRoomRepository`,
  `PostgresMeterReadingRepository`, `PostgresElectricityTariffRepository`,
  and `PostgresWaterTariffRepository` can each translate their own
  specific `UNIQUE` violation to the correct domain error code, without
  a generic SQLSTATE-mapping framework.

## Known debt: test-file typechecking

`backend/tsconfig.json` excludes `src/**/__tests__/**` from `npm run
typecheck`, a convention that predates this task. This means the normal
typecheck command never actually type-checks any `*.test.ts` file. For
this task, every new/changed test file was additionally verified with
an explicit one-off strict `tsc` invocation covering just those files
(not part of the regular `npm` scripts) — this caught real type errors
during development. This debt is unresolved and should be addressed in
a future QA/release-hardening task (e.g. a second `tsconfig` dedicated
to tests, or removing the exclusion once build-output pollution from
test files is otherwise handled) — not fixed inline here, to avoid
turning a management-API task into a TypeScript tooling redesign.
