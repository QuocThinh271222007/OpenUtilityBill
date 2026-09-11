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
| `npm test` | Run Calculation Core's unit tests (Node's built-in `node:test` runner, executed via `tsx` — no Jest/Vitest/Mocha). Covers `backend/src/calculation/**/*.test.ts`, including the official competition test cases. |

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
- No database connection is required to run the current foundation
  (health endpoint does not touch PostgreSQL/Supabase). `DATABASE_URL` is
  reserved for future work — see `database/README.md`.

## Repository layout

```
OpenUtilityBill/
  backend/     Node.js + TypeScript + Express REST API
  frontend/    Vite + TypeScript + Bootstrap client
  database/    Future PostgreSQL schema/migrations (Supabase-hosted)
  docs/        Architecture, error handling, and learning documentation
```
