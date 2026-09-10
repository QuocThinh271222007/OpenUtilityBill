# Transactions

This document defines where ACID properties matter in OpenUtilityBill,
and the transaction boundaries that future Service-layer workflows must
respect. It complements
[`docs/DOMAIN_MODEL.md`](DOMAIN_MODEL.md) and
[`docs/DATABASE_DESIGN.md`](DATABASE_DESIGN.md).

**No workflow code exists yet.** This document describes the *intended*
transaction boundaries for Service-layer code that a future task will
implement (`CreateInvoice`, tariff configuration, etc.) — see section 38
of the domain/database foundation task brief for what is explicitly
deferred.

## ACID, in the context of OpenUtilityBill

**Atomicity** — a multi-step write either fully happens or fully does not
happen. Example: creating an invoice writes one `invoices` row and
several `invoice_items` rows. If the process crashes after the
`invoices` row is written but before all `invoice_items` rows are, the
user must never see that half-created invoice — either all of it exists,
or none of it does.

**Consistency** — every write leaves the database satisfying its
constraints (foreign keys, `CHECK` constraints, `UNIQUE` constraints from
`database/migrations/001_initial_domain_schema.sql`). Example: an invoice
can never reference a `room_id` that does not exist, because the foreign
key makes that state unreachable, not just "discouraged by application
code."

**Isolation** — concurrent operations do not see each other's
in-progress, uncommitted changes. Example: if two requests try to create
an invoice for the same room and billing period at the same moment, each
transaction's partial work is invisible to the other until it commits;
the `UNIQUE (room_id, billing_period)` constraint then guarantees only
one of them succeeds.

**Durability** — once a transaction commits, the result survives a
crash immediately afterward. This is provided by PostgreSQL itself (via
Supabase); nothing in this project's code needs to implement it.

## A. Create Invoice (future workflow)

**Not implemented in this task.** This is the intended transaction
boundary for when the `CreateInvoice` Service workflow is built:

```
BEGIN

1. Verify required data exists and is valid (fail-fast, before any write):
   - Room exists (roomId).
   - The required electricity MeterReading exists for
     (roomId, billingPeriod, 'ELECTRICITY').
   - If waterBillingMethod = 'PER_CUBIC_METER', the required water
     MeterReading exists for (roomId, billingPeriod, 'WATER').
     (This is the cross-field rule docs/DATABASE_DESIGN.md documents as
     deliberately NOT a database CHECK constraint — it is validated here,
     in the Service layer, before any write.)
   - ElectricityTariff and WaterTariff (the versions to apply) exist and
     are effective for billingPeriod.
   - No invoice already exists for (roomId, billingPeriod) — the
     Service checks this explicitly so it can fail with a clear
     INVOICE_ALREADY_EXISTS error rather than only relying on the
     database UNIQUE constraint to reject the write.

2. Run the calculation (Calculation Core — future task). This step reads
   configuration and readings but does not write anything yet.

3. Insert one row into `invoices`, snapshotting:
   - tenant_count_used (Room.tenantCount at this moment)
   - electricity_tariff_id / water_tariff_id (the exact versions used)
   - electricity_billing_method / water_billing_method
   - electricity_reading_id / water_reading_id
   - calculated_total

4. Insert one row into `invoice_items` per breakdown line the
   calculation produced.

COMMIT
```

If **any** step from 3–4 fails (a constraint violation, a connection
drop, an unexpected error), the transaction must `ROLLBACK` — the
`invoices` row and any `invoice_items` rows written so far in that
attempt disappear together. The user must never be shown, or query, an
invoice that has a total but a missing or partial breakdown, or a
breakdown pointing at an invoice that doesn't fully exist.

**What happens when step 3 of 4 fails (concretely):** if inserting
`invoice_items` fails partway through (e.g. a `CHECK` constraint
violation on one row, or the connection drops), PostgreSQL rolls back
the entire transaction — including the `invoices` row inserted in step
3. The caller receives a failure `Result` (see
`docs/ERROR_HANDLING.md`); no invoice row is left behind for the caller
to accidentally treat as valid.

## B. Delete operations

No delete workflow exists yet (no CRUD is implemented in this task — see
section 38 of the brief). When one is added, it must respect the
`ON DELETE` policy already established in the schema (see
`docs/DATABASE_DESIGN.md`):

- Deleting a `RentalProperty`, `Room`, tariff row, or `MeterReading` that
  is still referenced by other data is `RESTRICT`ed by the database — the
  delete will fail with a foreign-key violation, not silently cascade.
  A future delete workflow must translate that into a clear domain error
  (e.g. `ROOM_HAS_DEPENDENT_RECORDS`), not a raw database error surfaced
  to the user (see `docs/ERROR_HANDLING.md` on user-facing vs.
  developer-facing error detail).
- Deleting an `Invoice` cascades to its `InvoiceItem` rows, because a
  breakdown line has no meaning without its parent invoice — but
  deleting an `Invoice` itself is a historical/financial record deletion
  and should be treated as a deliberate, explicit, and likely
  restricted administrative action once that workflow exists — not
  something implemented casually. No such workflow is designed here.

## C. Tariff configuration (future workflow)

**Not implemented in this task.** Creating a new `ElectricityTariff`
together with its tiers must be atomic — a tariff with only 3 of its 6
tiers inserted is not a valid, usable configuration:

```
BEGIN

1. Insert one row into `electricity_tariffs`.
2. Insert one row into `electricity_tariff_tiers` per tier.

COMMIT
```

If step 2 fails partway through (e.g. a duplicate `tier_number`, a
`threshold_kwh <= 0`), the transaction rolls back, including the
`electricity_tariffs` row from step 1. A partially configured tariff —
one that exists in `electricity_tariffs` but is missing tiers — must
never become visible to the rest of the application (in particular, it
must never be selectable as the `electricityTariffId` for an invoice,
since Calculation Core would not know how to allocate usage across an
incomplete tier list).

The seed script (`database/seeds/001_competition_defaults.sql`) already
follows this same pattern: one `BEGIN`/`COMMIT` around both the tariff
insert and its six tier inserts.

## Where ACID matters most in this project

The transaction boundaries above (`CreateInvoice`, tariff configuration)
are exactly the places where OpenUtilityBill's core promise —
"a shown invoice/tariff is either fully correct, or not shown at all" —
depends on the database, not just on careful application code. Every
other read in this project (viewing a room, listing invoices) is a
single-statement read and does not need an explicit transaction beyond
what a single query already provides.
