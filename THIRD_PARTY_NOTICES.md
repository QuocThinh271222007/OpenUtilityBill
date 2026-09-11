# Third-Party Notices

This file documents every direct (non-transitive) third-party dependency
in this repository, plus the runtime/hosting platforms the application
depends on. License information for npm packages was verified against
each installed package's own `package.json` metadata, not assumed.

## Backend (`backend/`)

| Package | Version installed | Purpose | Project URL | License |
|---|---|---|---|---|
| express | 4.22.2 | Minimal HTTP framework used for routing and the REST API surface. | https://expressjs.com/ | MIT |
| postgres | 3.4.9 | PostgreSQL client ("Postgres.js") used by the Repository layer to run parameterized SQL against Supabase-hosted PostgreSQL. This is a database *client*, not an ORM/query-builder — see `docs/DATABASE_ACCESS.md`. | https://github.com/porsager/postgres | Unlicense |
| @types/express | (dev) | TypeScript type definitions for Express. | https://www.npmjs.com/package/@types/express | MIT |
| @types/node | (dev) | TypeScript type definitions for the Node.js runtime. | https://www.npmjs.com/package/@types/node | MIT |
| tsx | 4.23.13 (dev) | Runs TypeScript directly with auto-reload during `npm run dev`, and executes `.test.ts` files for `npm test` — avoiding a manual build step. | https://github.com/privatenumber/tsx | MIT |
| typescript | 5.9.3 (dev) | Static typing and compilation for the backend source. | https://www.typescriptlang.org/ | Apache-2.0 |

## Frontend (`frontend/`)

| Package | Version installed | Purpose | Project URL | License |
|---|---|---|---|---|
| bootstrap | 5.3.8 | CSS component library used for layout and basic UI (badges, container, spacing). Imported as a package, not vendored into source. | https://getbootstrap.com/ | MIT |
| vite | 6.4.3 (dev) | Development server and production bundler for the frontend TypeScript client. | https://vite.dev/ | MIT |
| typescript | 5.9.3 (dev) | Static typing and compilation for the frontend source. | https://www.typescriptlang.org/ | Apache-2.0 |

## Runtime / platform / hosted service (NOT npm dependencies)

These are **not** packages installed into this repository — they are the
runtime the code executes on, and a hosted third-party service the
backend connects to over the network. None of them are bundled into, or
distributed with, this repository's source code.

| Name | Role in this project | Project/Vendor URL | License / Terms |
|---|---|---|---|
| Node.js | JavaScript/TypeScript runtime the backend (and its build tooling) executes on. | https://nodejs.org/ | MIT |
| PostgreSQL | The relational database engine storing all application data (see `database/migrations/`). | https://www.postgresql.org/ | PostgreSQL License (OSI-approved, permissive) |
| Supabase | Hosting provider for this project's PostgreSQL database (managed infrastructure only — this project does not use Supabase Auth, Storage, or the `@supabase/supabase-js` client). | https://supabase.com/ | Supabase's own Terms of Service (hosted service, not an open-source license grant for this repository's code) |

## Notes

- Only direct npm dependencies are listed in the two package tables
  above. Transitive dependencies are documented by the respective
  `package-lock.json` files and are not duplicated here.
- No dependency is vendored (copied) into this repository's source tree;
  all are installed via `npm install` and excluded from version control
  via `.gitignore` (`node_modules/`).
- No ORM or query-builder (Drizzle, Prisma, TypeORM, Sequelize, Knex,
  Kysely) is used — `postgres` is a client library; SQL is written
  directly by the Repository layer (see `docs/DATABASE_ACCESS.md`).
- A moderate-severity advisory exists in `qs` (a transitive dependency of
  `express` 4.x) at the time of writing
  (GHSA-x5fp-wj9c-mxmx, GHSA-4mjr-xmp4-gh2g). No fix is currently
  available without an Express major-version upgrade, which is out of
  scope for this task. Tracked for a future dependency review.
