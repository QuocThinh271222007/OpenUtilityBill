# Database

This directory holds the PostgreSQL schema and configuration seed for
OpenUtilityBill, hosted on [Supabase](https://supabase.com).

## Current status

The initial domain schema, the competition default configuration seed,
and a set of runtime validation scripts exist as SQL files (below).
**None has been run against a live database from this session** — no
`DATABASE_URL` or Supabase connection was available in this environment,
and this project deliberately does not require or install a local
PostgreSQL/Docker setup just to validate SQL (see `docs/TRANSACTIONS.md`
and the "Runtime validation with Supabase SQL Editor" section below). The
health endpoint (`GET /api/v1/health`) still does not touch the database.
No backend Repository or database client exists yet — see
`docs/ARCHITECTURE.md`.

Running the validation scripts (manually, in the Supabase SQL Editor) is
the way to turn "the schema looks correct" into "PostgreSQL confirmed the
schema is correct" — see below.

## Structure

```
database/
  migrations/
    001_initial_domain_schema.sql          Tables, constraints, relationships
    002_preserve_invoice_item_precision.sql  Widen invoice_items.quantity/amount to unconstrained NUMERIC
  seeds/
    001_competition_defaults.sql           Official competition default tariffs
  validation/
    001_domain_success_validation.sql      One run: schema/seed check + valid-data proof
    002_domain_constraint_validation.sql   One block at a time: constraint rejection proof
    003_validation_cleanup.sql             Safety net: delete only VALIDATION_* rows
    004_invoice_item_precision_validation.sql  One run: proves quantity/amount preserve >2 decimal places
```

## Running these files (once a real Supabase database is available)

```bash
psql "$DATABASE_URL" -f database/migrations/001_initial_domain_schema.sql
psql "$DATABASE_URL" -f database/migrations/002_preserve_invoice_item_precision.sql
psql "$DATABASE_URL" -f database/seeds/001_competition_defaults.sql
```

The seed is safe to re-run — see the idempotency notes at the top of
`database/seeds/001_competition_defaults.sql`.

## Runtime validation with Supabase SQL Editor

Static SQL review (balanced `BEGIN`/`COMMIT`, correct table creation
order, etc.) is not the same as proof that PostgreSQL actually accepts
this schema and enforces its constraints. The `database/validation/`
files provide that proof by inserting both valid and intentionally
invalid rows against a real database, then rolling all of it back.

Validation is split into two files with two different execution models,
because they need different treatment in the SQL Editor:

- **`001_domain_success_validation.sql`** contains **zero** intentionally
  failing statements — safe to paste and run **completely, in one
  execution**.
- **`002_domain_constraint_validation.sql`** contains 18 numbered blocks
  (`D1`–`D18`), each of which **deliberately** triggers one PostgreSQL
  constraint error to prove that constraint actually rejects bad data.
  **Run exactly one numbered block per "Run" click — never the whole
  file at once.** A PostgreSQL client (including, possibly, the Supabase
  SQL Editor) may stop executing a pasted batch as soon as one statement
  in it errors — so a later block's cleanup statement might never run if
  it were all sent together. Each block is self-contained (its own
  `BEGIN`/setup/`ROLLBACK`) specifically so this isn't a problem: run one,
  read its result, move to the next.

No local PostgreSQL/Docker setup is required or expected. Steps, using
the Supabase project's own SQL Editor:

1. Create (or open) the Supabase project for this repository.
2. Open **SQL Editor** in the Supabase dashboard.
3. Paste and run `database/migrations/001_initial_domain_schema.sql`.
   Expect: **PASS** (success, no errors).
4. Paste and run `database/migrations/002_preserve_invoice_item_precision.sql`.
   Expect: **PASS**.
5. Paste and run `database/seeds/001_competition_defaults.sql`.
   Expect: **PASS**.
6. Paste and run `database/validation/001_domain_success_validation.sql`
   **completely, in one execution**. Expect: **PASS** on every statement
   — read each `-- Kỳ vọng:` comment and compare against the actual
   result. Any error here means an actual problem, not an expected one.
7. Open `database/validation/002_domain_constraint_validation.sql` and
   run blocks `D1` through `D18` **one at a time**, in order or in any
   order — they don't depend on each other. For each block: select just
   that block's SQL (from its `-- ====` header down to its final
   `ROLLBACK;`), run it, and compare the error PostgreSQL actually
   returned against the block's `-- Kỳ vọng: FAIL — ...` comment. **A
   constraint error here is the test passing, not failing.** Fill in the
   PASS/FAIL checklist near the top of that file as you go.
8. Paste and run `database/validation/004_invoice_item_precision_validation.sql`
   **completely, in one execution** (no intentional errors, same model
   as step 6). Expect: `quantity_text` = `'62.5125'` and `amount_text` =
   `'124025.123456'` **exactly**, proving migration 002 actually
   prevents silent rounding on real PostgreSQL, not just on paper.
9. Optionally run `database/validation/003_validation_cleanup.sql` as a
   safety net — it only deletes rows whose name starts with
   `VALIDATION_SUCCESS_`, `VALIDATION_CONSTRAINT_`, or
   `VALIDATION_PRECISION_`, and never touches `Competition Default ...`
   rows. Under normal conditions (steps 6–8 run as documented) it will
   find nothing to delete, since no validation file ever issues `COMMIT`.
10. To prove seed idempotency: run `database/seeds/001_competition_defaults.sql`
    a second time (expect: **PASS**, no error), then re-run the
    "B. Competition seed verification" queries in
    `001_domain_success_validation.sql` — every count must be unchanged
    (1 electricity tariff, 6 tiers, 1 water tariff), proving the second
    run created no duplicates.
11. **Never** paste a real connection string, database password, or
    Supabase service-role/anon key into any file in this repository —
    only run these files directly inside the Supabase SQL Editor, where
    credentials are handled by Supabase itself, not typed into a file.

### Why not one big file with `SAVEPOINT`

An earlier version of this validation used a single file with
`SAVEPOINT` / `ROLLBACK TO SAVEPOINT` around each intentional error,
meant to be pasted and run once. `SAVEPOINT` itself is a real and correct
PostgreSQL feature — it creates a recoverable point inside a transaction,
so a later `ROLLBACK TO SAVEPOINT` can undo just the work since that
point. The problem was never `SAVEPOINT`'s semantics: it was that
`SAVEPOINT` only helps if the SQL client keeps sending the *next*
statement (the `ROLLBACK TO SAVEPOINT`) after an error — and some SQL
clients stop executing the rest of a pasted batch as soon as one
statement in it fails. Relying on that continuation behavior made the
proof fragile in a way that depended on Supabase SQL Editor's specific
behavior rather than on PostgreSQL's actual guarantees. Splitting into
independent, single-purpose blocks (`002_domain_constraint_validation.sql`)
removes that dependency entirely: each block finishes (successfully or
not) before the next one is even sent.

## Design documentation

- [`docs/DOMAIN_MODEL.md`](../docs/DOMAIN_MODEL.md) — what each entity
  means, its invariants, and why it exists separately.
- [`docs/DATABASE_DESIGN.md`](../docs/DATABASE_DESIGN.md) — schema-level
  reasoning: normalization, identity strategy, foreign keys, constraints,
  `NUMERIC` vs. `FLOAT`, why no ORM/triggers/stored procedures yet.
- [`docs/TRANSACTIONS.md`](../docs/TRANSACTIONS.md) — ACID guarantees and
  transaction boundaries for future write workflows (`CreateInvoice`,
  tariff configuration).

## Planned approach (unchanged from the project foundation)

- Access pattern: direct SQL, no ORM (see `docs/LEARNING_NOTES.md`).
- Persistence isolation: all SQL will live behind Repository modules in
  `backend/src/modules/<module>/`, never inside Controllers or Services
  (see `docs/ARCHITECTURE.md`). No Repository exists yet — this task is
  schema/domain design only.
- Connection configuration: `DATABASE_URL` (see `backend/.env.example`).
  No real credentials are ever committed to this repository.

The database client, Repository implementations, and the `CreateInvoice`
workflow described in `docs/TRANSACTIONS.md` are deferred to a future,
separately reviewable task.
