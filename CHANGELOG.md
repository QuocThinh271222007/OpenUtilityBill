# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- Domain model and database foundation: TypeScript domain types for
  `RentalProperty`, `Room`, `MeterReading`, `ElectricityTariff`,
  `ElectricityTariffTier`, `WaterTariff`, `Invoice`, and `InvoiceItem`
  (`backend/src/modules/{property,room,meter-reading,tariff,invoice}/`).
- Initial PostgreSQL schema
  (`database/migrations/001_initial_domain_schema.sql`): all domain
  tables with foreign keys, `UNIQUE`/`CHECK` constraints, `NUMERIC`
  financial types, and deliberate `ON DELETE` policy per relationship.
- Official competition default tariff configuration as seed data
  (`database/seeds/001_competition_defaults.sql`): electricity VAT,
  people-per-quota-unit, fallback tier, 6 electricity tiers, and water
  pricing/VAT/environmental fee — stored as data, not hard-coded.
- `docs/DOMAIN_MODEL.md`, `docs/DATABASE_DESIGN.md`, and
  `docs/TRANSACTIONS.md` documenting entity responsibilities, schema
  reasoning, and ACID/transaction boundaries for future write workflows.

No calculation formulas, live database connection, or CRUD
(Controllers/Services/Repositories) are included in this change — see
`docs/TRANSACTIONS.md` and `docs/ARCHITECTURE.md` for what is
deliberately deferred.

- Project foundation: repository documentation (`README.md`,
  `THIRD_PARTY_NOTICES.md`, `docs/ARCHITECTURE.md`,
  `docs/LEARNING_NOTES.md`, `docs/ERROR_HANDLING.md`,
  `docs/DEVELOPMENT.md`).
- Backend foundation (`backend/`): Node.js + TypeScript + Express, with
  `app.ts`/`server.ts` separation, the shared `Result<T>` contract
  (`backend/src/shared/result.ts`), and a versioned health endpoint
  (`GET /api/v1/health`) demonstrating the Route → Controller → Service
  boundary.
- Frontend foundation (`frontend/`): Vite + TypeScript + Bootstrap client
  with a minimal `api/ → controllers/ → views/` structure that displays
  live backend status on the page.
- `database/README.md` documenting the intended future PostgreSQL
  (Supabase-hosted) schema and migration location.

No calculation, database schema, or CRUD features are included in this
change — see `docs/ARCHITECTURE.md` for what is deliberately deferred.
