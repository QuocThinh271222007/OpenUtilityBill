# Database

This directory will hold the future PostgreSQL schema and migrations for
OpenUtilityBill, hosted on [Supabase](https://supabase.com).

## Current status

No schema exists yet. This foundation task only establishes the
application architecture (frontend, backend, docs). The health endpoint
(`GET /api/v1/health`) does not touch the database.

## Planned approach

- Database: PostgreSQL, hosted by Supabase.
- Access pattern: direct SQL, no ORM (see `docs/LEARNING_NOTES.md` for the
  reasoning).
- Persistence isolation: all SQL will live behind Repository modules in
  `backend/src/modules/<module>/`, never inside Controllers or Services
  (see `docs/ARCHITECTURE.md`).
- Migrations: files documenting schema changes will be added here once the
  first domain (e.g. `property`, `room`) is implemented.
- Connection configuration: `DATABASE_URL` (see `backend/.env.example`).
  No real credentials are ever committed to this repository.

Schema design, migrations, and the database client itself are intentionally
deferred to a separate, reviewable task.
