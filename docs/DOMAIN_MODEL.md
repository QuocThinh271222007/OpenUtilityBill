# Domain Model

This document explains the business entities OpenUtilityBill represents,
why each one exists, and how they relate. It complements
[`docs/DATABASE_DESIGN.md`](DATABASE_DESIGN.md) (schema-level reasoning)
and [`docs/TRANSACTIONS.md`](TRANSACTIONS.md) (transaction boundaries).

This task introduces **domain types only**
(`backend/src/modules/<domain>/<domain>.model.ts`) and the matching
database schema. No Controller, Route, Service, or Repository exists yet
for these domains — see `docs/ARCHITECTURE.md` for why that boundary
matters, and section 38 of the task brief for what is deliberately not
implemented yet.

## ASCII domain diagram

```
RentalProperty
    │ 1
    │
    │ N
   Room
    │
    ├──── N MeterReading   (one per room + billing_period + utility_type)
    │
    └──── N Invoice
              │
              └──── N InvoiceItem

ElectricityTariff
       │ 1
       │
       │ N
ElectricityTariffTier

WaterTariff   (standalone — PER_CUBIC_METER and PER_PERSON both live here)

Invoice ───references───▶ ElectricityTariff (electricityTariffId)
Invoice ───references───▶ WaterTariff (waterTariffId)
Invoice ───references───▶ MeterReading (electricityReadingId, required)
Invoice ───references───▶ MeterReading (waterReadingId, optional)
```

Relationships are expressed as **foreign key IDs** (`roomId: number`,
`tariffId: number`, ...), never as nested/embedded objects. See
"No circular dependencies" below.

## RentalProperty

- **File:** `backend/src/modules/property/property.model.ts`
- **Table:** `rental_properties`
- **Responsibility:** represents one rental establishment (e.g. one
  boarding house).
- **Key fields:** `id`, `name`, `address` (nullable), `createdAt`.
- **Relationships:** parent of `Room` (1 → N).
- **Invariant:** `name` is required (`NOT NULL`).
- **Why it exists separately:** it is the root of the property → room
  hierarchy. Keeping it a distinct entity (rather than a free-text field
  on `Room`) lets one property own many rooms without duplicating
  property-level data (name, address) on every room row.

## Room

- **File:** `backend/src/modules/room/room.model.ts`
- **Table:** `rooms`
- **Responsibility:** the actual billable unit — every meter reading and
  invoice belongs to a room, not directly to a property.
- **Key fields:** `id`, `propertyId`, `name`, `tenantCount`, `createdAt`.
- **Relationships:** belongs to one `RentalProperty`; parent of
  `MeterReading` and `Invoice` (1 → N each).
- **Invariant:** `tenantCount >= 0`; `name` is unique *within its
  property* (`UNIQUE (propertyId, name)`) — not globally unique. Two
  different properties may each have a room named "101"; the same
  property may not have two.
- **Why it exists separately:** a `RentalProperty` is not itself
  billable — a `Room` is. Splitting them lets a property have many
  independently-billed rooms with their own tenant counts and reading
  history.

**Important:** `tenantCount` is **current state**. It changes whenever
the landlord updates it in the app. A historical invoice must not be
affected by that change — see `Invoice.tenantCountUsed` below and
"Historical snapshot principle" in `docs/DATABASE_DESIGN.md`.

## MeterReading

- **File:** `backend/src/modules/meter-reading/meter-reading.model.ts`
- **Table:** `meter_readings`
- **Responsibility:** the raw previous/current meter values for one room,
  one utility (`ELECTRICITY` or `WATER`), one billing period.
- **Key fields:** `id`, `roomId`, `billingPeriod`, `utilityType`,
  `previousReading`, `currentReading`, `meterMaximumValue` (nullable),
  `createdAt`.
- **Relationships:** belongs to one `Room`; referenced by `Invoice`
  (`electricityReadingId`, `waterReadingId`).
- **Invariant:** exactly one reading per
  `(roomId, billingPeriod, utilityType)`; `billingPeriod` must be the
  first day of its month; `previousReading >= 0`, `currentReading >= 0`,
  `meterMaximumValue > 0` when present; when `meterMaximumValue` is
  present, both `previousReading` and `currentReading` must be `<=` it
  (a reading above the meter's own declared maximum is physically
  impossible — this is a simple bounds check, not a rollover
  calculation; see `docs/DATABASE_DESIGN.md` "Meter maximum value").
- **Why it exists separately:** electricity and water both need "a
  previous and current reading for a room in a month," differing only in
  `utilityType`. A single normalized table avoids two near-duplicate
  tables (`electricity_readings`, `water_readings`) or unrelated columns
  crammed into one row.

**Deliberately not represented yet:** meter rollover calculation (what
happens when `currentReading` wraps past `meterMaximumValue`). The schema
keeps `meterMaximumValue` so Calculation Core can implement that later —
this task only preserves the data, not the formula.

## ElectricityTariff

- **File:** `backend/src/modules/tariff/tariff.model.ts`
- **Table:** `electricity_tariffs`
- **Responsibility:** one *version* of electricity billing configuration
  — VAT rate, the quota parameter, and the fallback-method tier number.
- **Key fields:** `id`, `name`, `effectiveFrom`, `effectiveTo` (nullable),
  `electricityVatRate`, `peoplePerQuotaUnit`, `fallbackTierNumber`,
  `createdAt`.
- **Relationships:** parent of `ElectricityTariffTier` (1 → N);
  referenced by `Invoice.electricityTariffId`.
- **Invariant:** `effectiveTo >= effectiveFrom` when `effectiveTo` is
  set; unique per `(name, effectiveFrom)`; `0 <= electricityVatRate <=
  1` (a decimal fraction, e.g. `0.08` for 8% — see `docs/DATABASE_DESIGN.md`
  "Rates are stored as decimal fractions in [0, 1]").
- **Why it exists separately from ElectricityTariffTier:** the tariff
  holds configuration that applies once per version (VAT, quota
  parameter, fallback tier number); the tiers are a variable-length list
  that belongs *under* a specific version. Keeping them separate is what
  makes the tier count data-driven — see `ElectricityTariffTier` below.

## ElectricityTariffTier

- **File:** `backend/src/modules/tariff/tariff.model.ts`
- **Table:** `electricity_tariff_tiers`
- **Responsibility:** one pricing tier (threshold + unit price) within
  one `ElectricityTariff`.
- **Key fields:** `id`, `tariffId`, `tierNumber`, `thresholdKwh`
  (nullable), `unitPrice`.
- **Relationships:** belongs to one `ElectricityTariff`.
- **Invariant:** unique per `(tariffId, tierNumber)`; `tierNumber > 0`;
  `thresholdKwh > 0` when not `NULL`.
- **Why it exists separately:** if tier prices were columns
  (`tier1_price`, `tier2_price`, ...) on `electricity_tariffs`, the
  number of tiers would be fixed by the schema — changing it would mean
  an `ALTER TABLE`. As a child table (one row per tier), the tier count
  is entirely data: inserting or deleting a row changes it, with no code
  or schema change. `thresholdKwh = NULL` is the documented convention
  for "the final tier, unlimited remaining usage."

## WaterTariff

- **File:** `backend/src/modules/tariff/tariff.model.ts`
- **Table:** `water_tariffs`
- **Responsibility:** one version of water billing configuration,
  supporting both billing methods this competition requires.
- **Key fields:** `id`, `name`, `effectiveFrom`, `effectiveTo`
  (nullable), `pricePerCubicMeter`, `pricePerPerson`, `vatRate`,
  `environmentalFeeRate`, `createdAt`.
- **Relationships:** referenced by `Invoice.waterTariffId`.
- **Invariant:** `effectiveTo >= effectiveFrom` when set; unique per
  `(name, effectiveFrom)`; `0 <= vatRate <= 1` and
  `0 <= environmentalFeeRate <= 1` (decimal fractions — see
  `docs/DATABASE_DESIGN.md` "Rates are stored as decimal fractions in
  [0, 1]"). `pricePerCubicMeter`/`pricePerPerson` are currency amounts,
  not rates, and have no such upper bound.
- **Why it exists separately (and why it isn't split further):**
  `PER_CUBIC_METER` and `PER_PERSON` are two *billing methods* of the
  same configuration version, not two independent systems — both share
  the same VAT rate, environmental fee rate, and effective dates. One
  table avoids duplicating that shared configuration into two tables
  that would always need to change together.

## Invoice

- **File:** `backend/src/modules/invoice/invoice.model.ts`
- **Table:** `invoices`
- **Responsibility:** the historical billing result for one room, one
  billing period.
- **Key fields:** `id`, `roomId`, `billingPeriod`, `tenantCountUsed`,
  `electricityTariffId`, `waterTariffId`, `electricityBillingMethod`,
  `waterBillingMethod`, `electricityReadingId`, `waterReadingId`
  (nullable), `calculatedTotal`, `actualChargedAmount` (nullable),
  `createdAt`.
- **Relationships:** belongs to one `Room`; references one
  `ElectricityTariff`, one `WaterTariff`, one electricity `MeterReading`,
  and optionally one water `MeterReading`; parent of `InvoiceItem`
  (1 → N).
- **Invariant:** unique per `(roomId, billingPeriod)`; `calculatedTotal
  >= 0`; `actualChargedAmount >= 0` when present.
- **Why it exists separately:** it is the durable record of "what was
  actually billed and why" — see "Historical snapshot principle" below.
- **Why there is no `differenceAmount` field:** the difference between
  what was actually charged and what was calculated
  (`actualChargedAmount - calculatedTotal`) is fully derived from those
  two persisted fields. Storing a third field for a derived value risks
  it going stale — if `actualChargedAmount` is corrected later, a
  previously stored `differenceAmount` would silently become wrong
  unless something remembers to update it too. The single source of
  truth is `calculatedTotal` and `actualChargedAmount`; the difference
  is computed on demand by the Service/Calculation layer when needed for
  display, not persisted. See "Derived values are not persisted" in
  `docs/DATABASE_DESIGN.md`.

## InvoiceItem

- **File:** `backend/src/modules/invoice/invoice.model.ts`
- **Table:** `invoice_items`
- **Responsibility:** one line of an invoice's breakdown (e.g. "Tier 2:
  50 kWh × 2050 VND", "Electricity VAT: 8%").
- **Key fields:** `id`, `invoiceId`, `category`, `tierNumber` (nullable),
  `quantity` (nullable), `unitName` (nullable), `unitPrice` (nullable),
  `amount`, `description` (nullable), `displayOrder`.
- **Relationships:** belongs to one `Invoice`.
- **Invariant:** unique per `(invoiceId, displayOrder)`; `tierNumber >
  0` when present; `unitPrice >= 0` when present.
- **Why it exists separately:** an `Invoice` only has a
  `calculatedTotal` — a single number cannot explain itself. Splitting
  the breakdown into relational rows (rather than one JSON column) keeps
  it directly queryable and inspectable with plain SQL, per
  `docs/DATABASE_DESIGN.md`.

## Historical snapshot principle

Two kinds of data appear in this schema, and they are **not** the same
thing even when they look similar:

| Reference data (current state) | Historical snapshot (frozen at calculation time) |
|---|---|
| `Room.tenantCount` | `Invoice.tenantCountUsed` |
| `ElectricityTariff` / `WaterTariff` rows (may be superseded by a newer version later) | `Invoice.electricityTariffId` / `waterTariffId` (points at the exact version used) |
| — | `InvoiceItem.unitPrice` (the price actually applied to that line, at that time) |

This is **intentional duplication**, not a normalization mistake. If
`Invoice` only stored `roomId` and looked up "the current tenant count"
or "the current tariff" every time it was displayed, editing the room or
adding a new tariff version later would silently change the amount on an
old, already-issued invoice. For a utility-billing transparency app, that
would be a correctness bug, not a storage optimization. Snapshotting the
values actually used at calculation time is what makes an invoice
**historically stable** — see `docs/DATABASE_DESIGN.md` for the same
principle applied at the schema/constraint level.

## No circular dependencies

Every relationship above is expressed as a plain numeric ID
(`roomId: number`, `tariffId: number`, ...), never as a nested/embedded
object graph (`room.property.rooms[0].property...`). This keeps each
model:

- Independently serializable to JSON without cycles.
- Independently understandable — reading `room.model.ts` never requires
  also reading `property.model.ts`.
- Free of import cycles between modules (`room.model.ts` does not import
  `property.model.ts`, and vice versa; only `invoice.model.ts` imports
  billing-method types from `tariff.model.ts`, a one-directional
  dependency).

## Why recursion is unnecessary here

None of these entities form a recursive/self-referential structure (no
entity references "many of its own kind" the way a folder tree or a
comment thread would). Every relationship is a flat foreign-key
reference to a *different* entity type. TypeScript and SQL both support
recursion, but there is nothing recursive to model — plain foreign keys
are simpler and sufficient. See `docs/LEARNING_NOTES.md` for the same
reasoning applied to tariff tier iteration.
