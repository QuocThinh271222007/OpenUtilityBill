# Database

This directory holds the PostgreSQL schema and configuration seed for
OpenUtilityBill, hosted on [Supabase](https://supabase.com).

## Current status

The initial domain schema, the competition default configuration seed,
and a runtime validation script exist as SQL files (below). **None has
been run against a live database from this session** — no `DATABASE_URL`
or Supabase connection was available in this environment, and this
project deliberately does not require or install a local
PostgreSQL/Docker setup just to validate SQL (see `docs/TRANSACTIONS.md`
and the "Runtime validation with Supabase SQL Editor" section below). The
health endpoint (`GET /api/v1/health`) still does not touch the database.
No backend Repository or database client exists yet — see
`docs/ARCHITECTURE.md`.

Running the validation script (manually, in the Supabase SQL Editor) is
the way to turn "the schema looks correct" into "PostgreSQL confirmed the
schema is correct" — see below.

## Structure

```
database/
  migrations/
    001_initial_domain_schema.sql        Tables, constraints, relationships
  seeds/
    001_competition_defaults.sql         Official competition default tariffs
  validation/
    001_domain_runtime_validation.sql    Runtime proof the constraints work
```

## Running these files (once a real Supabase database is available)

```bash
psql "$DATABASE_URL" -f database/migrations/001_initial_domain_schema.sql
psql "$DATABASE_URL" -f database/seeds/001_competition_defaults.sql
```

The seed is safe to re-run — see the idempotency notes at the top of
`database/seeds/001_competition_defaults.sql`.

## Runtime validation with Supabase SQL Editor

Static SQL review (balanced `BEGIN`/`COMMIT`, correct table creation
order, etc.) is not the same as proof that PostgreSQL actually accepts
this schema and enforces its constraints. `database/validation/
001_domain_runtime_validation.sql` provides that proof by inserting both
valid and intentionally-invalid rows against a real database and
recording what PostgreSQL actually does — then rolling all of it back.

No local PostgreSQL/Docker setup is required or expected. Steps, using
the Supabase project's own SQL Editor:

1. Create (or open) the Supabase project for this repository.
2. Open **SQL Editor** in the Supabase dashboard.
3. Paste and run `database/migrations/001_initial_domain_schema.sql`.
   Expect success with no errors.
4. Paste and run `database/seeds/001_competition_defaults.sql`. Expect
   success.
5. Paste and run `database/validation/001_domain_runtime_validation.sql`
   **in one execution** (one paste, one "Run") — see the file's header
   comment for why splitting it into separate runs can break the
   `SAVEPOINT`s it relies on. Read each block's "Kỳ vọng" (expected)
   comment against the actual result/error PostgreSQL returns.
6. Optionally, re-run step 4 a second time, then re-run the "B. Seed
   verification" queries at the top of the validation file to confirm no
   duplicate seed rows were created.
7. **Never** paste a real connection string, database password, or
   Supabase service-role/anon key into any file in this repository —
   only run these files directly inside the Supabase SQL Editor, where
   credentials are handled by Supabase itself, not typed into a file.

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
