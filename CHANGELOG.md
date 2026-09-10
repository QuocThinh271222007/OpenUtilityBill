# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Fixed

- Corrected the competition tariff seed dates: electricity
  `effective_from` now cites the real legal date (2025-05-10, per
  Decision 1279/QĐ-BCT) with `effective_to = 2026-12-31` documented as
  bounding the seeded 8% VAT setting, not the underlying price; water
  `effective_from` (2026-09-06) is documented as the competition
  configuration's activation date, not a legal tariff date, with
  `effective_to` left `NULL`.
- Removed the derived `difference_amount` column/field from `invoices`
  and the `Invoice` model — it duplicated `actual_charged_amount -
  calculated_total` and risked going stale; it is now computed on
  demand instead of persisted.
- Added `UNIQUE (property_id, name)` to `rooms` so a room name is
  unambiguous within one property (not globally).
- Added `CHECK` constraints so `previous_reading`/`current_reading`
  cannot exceed a declared `meter_maximum_value`.
- Tightened `electricity_vat_rate`, `water_tariffs.vat_rate`, and
  `environmental_fee_rate` to `0 <= rate <= 1`, since rates are stored
  as decimal fractions (e.g. `0.08`, not `8`).

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
