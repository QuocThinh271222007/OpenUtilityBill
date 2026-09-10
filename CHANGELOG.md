# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

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
