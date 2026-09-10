# Database

This directory holds the PostgreSQL schema and configuration seed for
OpenUtilityBill, hosted on [Supabase](https://supabase.com).

## Current status

The initial domain schema and the competition default configuration seed
exist as SQL files (below). **Neither has been run against a live
database in this task** — no `DATABASE_URL` was available, and this task
deliberately does not require or install a local PostgreSQL/Docker setup
(see `docs/TRANSACTIONS.md` and the task brief). The health endpoint
(`GET /api/v1/health`) still does not touch the database. No backend
Repository or database client exists yet — see `docs/ARCHITECTURE.md`.

## Structure

```
database/
  migrations/
    001_initial_domain_schema.sql   Tables, constraints, relationships
  seeds/
    001_competition_defaults.sql    Official competition default tariffs
```

## Running these files (once a real Supabase database is available)

```bash
psql "$DATABASE_URL" -f database/migrations/001_initial_domain_schema.sql
psql "$DATABASE_URL" -f database/seeds/001_competition_defaults.sql
```

The seed is safe to re-run — see the idempotency notes at the top of
`database/seeds/001_competition_defaults.sql`.

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
