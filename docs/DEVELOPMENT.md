# Development Guide

Commands below match this repository exactly as of the project-foundation
task. `frontend/` and `backend/` are independent npm projects — there is
no root-level `package.json`.

## Prerequisites

- Node.js (tested with v24.x)
- npm (tested with v11.x)

## Clone

```bash
git clone https://github.com/QuocThinh271222007/OpenUtilityBill.git
cd OpenUtilityBill
```

## Backend

```bash
cd backend
npm install
cp .env.example .env   # edit values if needed; PORT defaults to 3000
```

| Command | Purpose |
|---|---|
| `npm run dev` | Start the backend with auto-reload (`tsx watch`). |
| `npm run typecheck` | Run `tsc --noEmit` — type-check without emitting files. |
| `npm run build` | Compile TypeScript to `backend/dist/`. |
| `npm start` | Run the compiled server (`node dist/server.js`). Requires `npm run build` first. |
| `npm test` | Run all backend tests (Node's built-in `node:test` runner, executed via `tsx` — no Jest/Vitest/Mocha). Covers `backend/src/**/*.test.ts`: Calculation Core (including the official competition test cases), database config/adapter unit tests, and Repository row-mapping/error-semantics unit tests. Tests that need a real PostgreSQL connection (`*.integration.test.ts`) auto-**skip** (not fail) when `DATABASE_URL` is unset. |

Verify it works:

```bash
curl http://localhost:3000/api/v1/health
# {"success":true,"data":{"status":"ok"}}
```

## Frontend

```bash
cd frontend
npm install
```

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite dev server (proxies `/api` to `http://localhost:3000`, see `frontend/vite.config.ts`). |
| `npm run typecheck` | Run `tsc --noEmit`. |
| `npm run build` | Type-check, then produce a production build in `frontend/dist/`. |

For the "Backend: OK" status on the page to appear, the backend must also
be running (`npm run dev` in `backend/`, in a separate terminal).

## Environment setup

- Backend environment variables are documented in `backend/.env.example`.
  Copy it to `backend/.env` and edit locally — `.env` is git-ignored and
  must never be committed.
- `DATABASE_URL` is required to run anything that touches the database
  (the Repository layer, `npm run dev`/`start` if a route ever calls a
  Repository, and the `*.integration.test.ts` tests). The health
  endpoint (`GET /api/v1/health`) still does **not** touch the database
  and works with no `DATABASE_URL` set — see `docs/DATABASE_ACCESS.md`.
  Never put a real Supabase connection string in a committed file.

## Repository layout

```
OpenUtilityBill/
  backend/     Node.js + TypeScript + Express REST API,
               domain models, Calculation Core, database adapter
               and Repository layer
  frontend/    Vite + TypeScript + Bootstrap client
  database/    PostgreSQL schema (migrations/), seed data (seeds/),
               and runtime validation SQL (validation/) — Supabase-hosted
  docs/        Architecture, database access, calculation, and
               learning documentation
```
