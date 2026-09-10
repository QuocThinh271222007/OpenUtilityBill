# Database Design

This document explains the schema-level decisions behind
`database/migrations/001_initial_domain_schema.sql`. It complements
[`docs/DOMAIN_MODEL.md`](DOMAIN_MODEL.md) (what each entity means) and
[`docs/TRANSACTIONS.md`](TRANSACTIONS.md) (transaction boundaries).

## Why a relational database

OpenUtilityBill's core data is inherently relational: a room belongs to
exactly one property, an invoice references exactly one room, one
electricity tariff, one water tariff, and one or two meter readings, and
every one of those references must remain valid (an invoice must not
point at a room that no longer exists). Foreign keys let PostgreSQL
enforce that automatically. The billing domain also needs multi-step
writes that must succeed or fail together (see `docs/TRANSACTIONS.md`) —
a relational database with real transactions is a natural fit.

### Why not NoSQL

A document database (e.g. MongoDB) would need to either duplicate
related data into every document (a tariff embedded in every invoice) or
manage references manually without foreign-key enforcement. Given how
central "this invoice must reference exactly this tariff version, and
that reference must never dangle" is to this project's integrity, giving
up database-enforced referential integrity would trade away exactly the
guarantee this project needs most, for a flexibility (schema-less
documents) this project does not need — the entities and their
relationships are already well understood and stable.

## Normalization decisions

The schema is normalized to the point where duplicating data would cause
real problems, and no further:

- `RentalProperty` and `Room` are separate tables (not `Room` columns
  duplicated per property) because a property has many rooms.
- `ElectricityTariff` and `ElectricityTariffTier` are separate tables
  (not `tier1_price`...`tierN_price` columns) so the number of tiers is
  data, not schema — see `docs/DOMAIN_MODEL.md`.
- `MeterReading` uses one normalized shape for both utilities
  (`utility_type` column) instead of two parallel tables with identical
  structure.

Where duplication *does* appear (`Invoice.tenantCountUsed`,
`InvoiceItem.unitPrice`, tariff references by ID rather than by "latest
version"), it is intentional — see "Intentional historical snapshots"
below. Normalization is a tool for avoiding update anomalies, not a rule
to apply everywhere regardless of consequence.

## Intentional historical snapshots

See `docs/DOMAIN_MODEL.md` "Historical snapshot principle" for the full
explanation with a table of examples. Summary: `Invoice` and
`InvoiceItem` freeze the exact values used to calculate them
(`tenantCountUsed`, tariff *version* IDs, `InvoiceItem.unitPrice`)
precisely so that later edits to `Room`, `ElectricityTariff`, or
`WaterTariff` cannot silently change an already-issued invoice. This is
not "bad normalization" — normalization rules apply to *current,
mutable* reference data; a historical record is deliberately supposed to
stop tracking the current value at the moment it is written.

## Identity key strategy

Every primary key uses:

```sql
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
```

This is PostgreSQL's standard auto-incrementing identity column
(the modern replacement for `SERIAL`). It was chosen over UUIDs because:

- It requires no extension (`pgcrypto`/`uuid-ossp`) — fewer moving parts
  to install/explain on Supabase.
- It is trivially explainable: "the database assigns the next number."
- Nothing in this schema needs UUID's actual benefits (merging rows from
  multiple independent databases, hiding row counts from clients). This
  is a single Postgres database with one write path (the backend), so
  those benefits would be paid for without being used.

`BIGINT` (not `INTEGER`) was chosen simply to avoid ever worrying about
the 32-bit integer ceiling, at negligible storage cost.

## Foreign keys

Every relationship in `docs/DOMAIN_MODEL.md`'s diagram is enforced with
a `REFERENCES` foreign key — see the table-by-table breakdown in the
main report and inline comments in the migration file for exactly why
each one exists. In short: foreign keys are what makes "an invoice can
never reference a room that was deleted" a database guarantee instead of
an application convention someone could forget to check.

## Unique constraints

| Constraint | Table | Why |
|---|---|---|
| `(name, effective_from)` | `electricity_tariffs`, `water_tariffs` | Supports idempotent seeding via `ON CONFLICT` (see `database/seeds/001_competition_defaults.sql`) and prevents two configuration rows with the same name and effective date. |
| `(room_id, billing_period, utility_type)` | `meter_readings` | Exactly one reading per room, per month, per utility — the schema-level guarantee behind `docs/DOMAIN_MODEL.md`'s `MeterReading` invariant. |
| `(tariff_id, tier_number)` | `electricity_tariff_tiers` | A tier number must not repeat within one tariff version. |
| `(room_id, billing_period)` | `invoices` | One invoice per room per month, for the initial mandatory scope (see "Invoice revision" below). |
| `(invoice_id, display_order)` | `invoice_items` | Two breakdown lines on the same invoice must not claim the same display position. |

## Check constraints

Every simple, single-purpose invariant from the task's numeric/business
rule list is enforced with a `CHECK`:

- `tenant_count >= 0`, `tenant_count_used >= 0`
- `tier_number > 0`
- `threshold_kwh > 0` when not `NULL`
- `unit_price >= 0`
- `electricity_vat_rate >= 0`, `vat_rate >= 0`, `environmental_fee_rate >= 0`
- `previous_reading >= 0`, `current_reading >= 0`
- `meter_maximum_value > 0` when provided
- `calculated_total >= 0`
- `actual_charged_amount >= 0` when provided
- `effective_to >= effective_from` when `effective_to` is set (both
  tariff tables)
- `difference_amount` only set when `actual_charged_amount` is also set
- `billing_period` is always the first day of its month
  (`EXTRACT(DAY FROM billing_period) = 1`)
- `utility_type`, `electricity_billing_method`, `water_billing_method`,
  `invoice_items.category` are restricted to their documented value sets

**Deliberately not a `CHECK` constraint:** "`water_reading_id` must be
`NOT NULL` when `water_billing_method = 'PER_CUBIC_METER'`." This is a
real business rule (see `docs/DOMAIN_MODEL.md`), but it is a *cross-field
conditional* rule tied to a workflow decision, not a simple standalone
invariant. Encoding it in a `CHECK` would blur the line this project
draws between "database enforces basic shape and range" and "Service
layer enforces business workflow rules" (see `docs/ARCHITECTURE.md`).
This is deferred to the Service layer's fail-fast validation when the
`CreateInvoice` workflow is implemented — see `docs/TRANSACTIONS.md`.

**Deliberately not constrained:** `previous_reading <= current_reading`.
A meter that rolls over past `meter_maximum_value` can legitimately
report a smaller `current_reading` than `previous_reading` (it wrapped
back toward zero). Distinguishing "valid rollover" from "data entry
error" needs the reading's relationship to `meter_maximum_value`, which
is exactly the kind of calculation this project keeps out of the
database (see "Why no triggers/stored procedures yet" below) — it will
live in Calculation Core.

**Considered and deferred:** a uniqueness constraint on `(property_id,
name)` for `rooms`, to prevent two rooms in the same property sharing a
name. Not part of the task's required invariant list; left for a future
migration if duplicate room names turn out to cause real confusion in
practice, rather than added speculatively now.

## Deletion behavior (`ON DELETE` policy)

`ON DELETE CASCADE` is **not** used everywhere — each relationship was
decided individually:

| Relationship | Behavior | Why |
|---|---|---|
| `rooms.property_id → rental_properties` | `RESTRICT` | A room is meaningful business data (and may have readings/invoices under it). Deleting a property must not silently delete its rooms — the owner must handle rooms explicitly first. |
| `meter_readings.room_id → rooms` | `RESTRICT` | Meter readings are historical evidence for past invoices. A room must not disappear-and-take-its-reading-history-with-it. |
| `invoices.room_id → rooms` | `RESTRICT` | Same reasoning: an invoice is a financial record; it must not vanish because someone deleted the room. |
| `invoices.electricity_tariff_id / water_tariff_id → tariffs` | `RESTRICT` | A tariff version referenced by a historical invoice must remain available to explain that invoice, even after a newer tariff version is introduced. |
| `invoices.electricity_reading_id / water_reading_id → meter_readings` | `RESTRICT` | The reading an invoice was calculated from must remain traceable. |
| `electricity_tariff_tiers.tariff_id → electricity_tariffs` | `CASCADE` | A tier has no independent meaning without its parent tariff — it *is* part of that tariff's configuration, not a standalone record. Invoices reference the tariff as a whole (`electricity_tariff_id`), never an individual tier row, so cascading tier deletes cannot orphan or corrupt invoice history. |
| `invoice_items.invoice_id → invoices` | `CASCADE` | An invoice item only exists to explain its parent invoice; deleting the invoice legitimately deletes its breakdown with it. |

The general rule: **`RESTRICT` protects anything that is, or feeds,
historical/financial record-keeping. `CASCADE` is reserved for rows that
are purely a "part of" their parent and have no meaning or reference
pointing at them independently.**

## `NUMERIC` vs. `FLOAT`

Every field representing money, a rate, a fee, or a calculated financial
amount (`unit_price`, `electricity_vat_rate`, `vat_rate`,
`environmental_fee_rate`, `price_per_cubic_meter`, `price_per_person`,
`calculated_total`, `actual_charged_amount`, `difference_amount`,
`invoice_items.amount`/`unit_price`/`quantity`, `threshold_kwh`,
meter readings) uses PostgreSQL `NUMERIC(precision, scale)`, never
`REAL`/`FLOAT`/`DOUBLE PRECISION`.

`FLOAT`/`REAL` are IEEE-754 binary floating point — they cannot represent
most decimal fractions (including money amounts like `0.10`) exactly,
which can produce tiny rounding errors that compound across
calculations. `NUMERIC` stores an exact decimal value, which is what a
billing application needs: a VAT rate of `0.08` must mean exactly
`0.08`, not `0.08000000000000000004`.

### Database `NUMERIC` vs. TypeScript runtime representation — a separate decision

Storing values as `NUMERIC` in PostgreSQL is a **database-layer**
decision, made in this task. It does not, by itself, decide how
TypeScript code will do arithmetic on those values later — that is a
**separate, runtime-layer** decision for Calculation Core, deferred to
that task.

For this task's domain model types
(`backend/src/modules/*/*.model.ts`), every field backed by a `NUMERIC`
column is typed as TypeScript `string`, documented inline in each model
file. This matches how the standard PostgreSQL driver for Node.js (`pg`)
returns `NUMERIC` values by default — as strings, specifically to avoid
silently truncating precision by parsing into a JS `number`
(IEEE-754 double, the same representation problem as `FLOAT`/`REAL`).
Choosing `string` at the model boundary means this project does not
silently downgrade to imprecise floating point the moment data crosses
from the database into TypeScript.

Whether Calculation Core later parses these strings into `number`
(acceptable for values that fit safely within double precision, with
careful rounding rules), uses a decimal arithmetic library, or works with
the strings directly, is a decision for that future task — not decided,
and not needed, here. Do not treat the `string` typing in the current
model files as an implicit answer to that question.

## Tariff versions and effective dates

`ElectricityTariff` and `WaterTariff` both carry `effective_from` and
`effective_to` (nullable — an open-ended/current version has no end
date). This lets the system represent "the tariff that was in effect
when this invoice's billing period occurred" as data, rather than
assuming there is ever only one tariff. Overlap prevention between tariff
versions (e.g. rejecting two active tariffs with overlapping date ranges)
is **not** enforced in this schema — doing so with a simple `CHECK` is
not possible (`CHECK` constraints cannot compare across rows), and a
proper solution (an `EXCLUDE` constraint over a date range) requires the
`btree_gist` extension, which this task avoids introducing without a
concrete need
(see "no unnecessary PostgreSQL extensions" in the task brief). If
overlapping tariff versions become a real data-quality problem, that is
a candidate for a future, explicitly justified migration.

## Why SQL stays readable and direct

Every constraint above is visible directly in
`database/migrations/001_initial_domain_schema.sql` as plain
`CREATE TABLE` statements with inline `CHECK`/`REFERENCES` clauses — not
generated by a tool, not hidden behind an ORM's model decorators. The
repository owner can read the migration top to bottom and know exactly
what the database will enforce, with no indirection to trace through
during an oral defense.

## Why no ORM

See `docs/LEARNING_NOTES.md` ("Vì sao dùng SQL trực tiếp, chưa dùng
ORM") for the full reasoning. In short: an ORM's main value here (mapping
rows to objects, generating queries) is not worth the cost of an
additional abstraction layer to learn, explain, and debug, for a project
whose owner needs to be able to explain every generated query personally.
Direct SQL, isolated behind Repository modules once they exist, achieves
the persistence-isolation goal without that added layer.

## Why no triggers or stored procedures yet

The task brief for this schema explicitly avoids both, and the reasoning
holds beyond just "the brief said so": triggers and stored procedures
move logic *into* the database, invisible to anyone reading the
TypeScript codebase, and harder to unit test than a plain TypeScript
function. This project's Calculation Core is deliberately kept as
database-independent TypeScript specifically so calculation logic stays
visible, testable, and debuggable in one place (see
`docs/ARCHITECTURE.md`). The two cross-field business rules this schema
does *not* enforce (`water_reading_id` required for
`PER_CUBIC_METER`; rollover-aware reading comparisons) are exactly the
kind of rule that would otherwise tempt a trigger — they are deferred to
the Service layer instead, for the same reason.
