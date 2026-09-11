# Database Access

This document explains how the backend talks to PostgreSQL: the client
library, the Repository boundary, the security model, the precision
contracts (`NUMERIC`, `BIGINT`), transactions, and error handling. It
complements [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) (where this layer
sits), [`docs/DATABASE_DESIGN.md`](DATABASE_DESIGN.md) (the schema
itself), and [`docs/ERROR_HANDLING.md`](ERROR_HANDLING.md) (the
`Result<T>` contract this layer reuses).

## Why Postgres.js, and why no ORM

The owner explicitly approved: PostgreSQL hosted by Supabase, accessed
via **Postgres.js** (the `postgres` npm package) with **direct
parameterized SQL** — no ORM, no query-builder framework (Drizzle,
Prisma, TypeORM, Sequelize, Knex, Kysely).

Postgres.js is a PostgreSQL *client* — it opens connections, sends the
SQL text and parameters this project writes, and decodes the response.
It does not generate SQL from an object model, does not manage a schema,
and does not impose a query-building DSL. This matches the project-wide
principle (see `docs/LEARNING_NOTES.md`) that the repository owner must
be able to read and explain exactly what SQL runs — with an ORM, the
actual SQL is often generated indirectly and harder to predict; with a
plain client and hand-written SQL, the query in the source file *is* the
query that runs.

## Direct SQL does not mean SQL anywhere

"Direct SQL" describes *how* a query is written (by hand, not
generated) — it does **not** mean SQL is allowed anywhere in the
codebase. The dependency direction is still strict:

```
Controller  →  Service / Orchestrator  →  Repository interface
                       ↓                          ↓
                 Calculation Core       Postgres repository implementation
                                                   ↓
                                         Database adapter (Postgres.js)
                                                   ↓
                                          PostgreSQL / Supabase
```

- **Controllers never contain SQL.** They parse HTTP input and call a
  Service.
- **Services never contain SQL.** They orchestrate a workflow and call
  Repository interfaces.
- **Calculation Core never imports database code.** It receives data as
  plain function parameters (see `docs/CALCULATION_CORE.md`).
- **SQL exists only under `backend/src/database/` and
  `backend/src/repositories/`** — this is audited (see "SQL location
  audit" below).

## Repository boundary

Each domain has a small, explicit **Repository interface**
(`backend/src/repositories/*.repository.ts`) describing *what* can be
read, in domain terms — e.g. `RoomRepository.findById(id): Promise<Result<Room>>`.
The interface has no SQL and no Postgres.js import.

The **Postgres implementation** (`backend/src/repositories/postgres/postgres-*.repository.ts`)
is the only place that SQL for that domain exists. It:

1. Runs a parameterized query via the `DatabaseExecutor` passed into its
   constructor.
2. Maps the raw row(s) to the existing domain model
   (`backend/src/modules/*/*.model.ts`) with a small, explicit mapper
   function — not an automatic mapping library.
3. Translates failures into `Result<T>` (see "Error translation" below).

No `GenericRepository<T>`/`BaseRepository` exists. Each repository has
only the operations a real, current use case needs — see the table in
`README.md`/`CHANGELOG.md` for exactly which methods exist and why.

## Parameterized queries (SQL injection prevention)

Every dynamic value goes through Postgres.js's tagged-template
parameter substitution:

```ts
await sql<RoomRow[]>`
  SELECT id, property_id, name, tenant_count, created_at
  FROM rooms
  WHERE id = ${id}
`;
```

`${id}` is sent to PostgreSQL as a bound parameter, not concatenated
into the query text — PostgreSQL itself keeps the SQL structure and the
data completely separate, so a value like `id = "1; DROP TABLE rooms;"`
is just treated as a (non-matching) literal string, never as SQL syntax.

`sql.unsafe(...)` (which accepts a raw string and skips this
protection) is **not used anywhere** in this codebase — see the audit
result in the final report of the task that introduced this layer.

## Connection lifecycle

`backend/src/database/postgres-client.ts` creates **one** Postgres.js
client (`postgres(connectionString)`) per process, cached at module
scope, and every Repository reuses it. Postgres.js manages its own
internal connection pool inside that single `Sql` instance — this
project does **not** implement a custom connection pool; doing so would
duplicate what the client already does correctly.

`closeDatabaseClient()` exists so a server shutdown path or a test can
close the connection cleanly (no "hanging connection" keeping a test
process alive). It is called **once**, at shutdown/teardown — never
after each individual query, which would defeat the purpose of
connection reuse.

## Transactions

`backend/src/database/transaction.ts` exports `runInTransaction`, a
thin wrapper around Postgres.js's `sql.begin()`:

```ts
const result = await runInTransaction(async (tx) => {
  await tx`INSERT INTO ...`;
  await tx`INSERT INTO ...`;
  return ok(someValue);
});
```

Every write inside `work` **must** use the `tx` parameter it receives —
not the global client from `getDatabaseClient()` — so all writes in one
logical operation share the same actual database transaction. If `work`
returns a failed `Result`, `runInTransaction` throws internally to make
Postgres.js roll back, then converts that back into the same failed
`Result` at the boundary — callers only ever see `Result<T>`, never a
raw thrown error, for the expected-failure path.

**Transaction scope rule:** Calculation Core must run *before*
`runInTransaction` is called, not inside it. The intended future shape
(for a `CreateInvoice` workflow, not implemented in this task) is:

```
load required data (Repository reads)
        ↓
validate + calculate (Calculation Core — pure, no I/O)
        ↓
BEGIN  (runInTransaction)
  insert invoice
  insert invoice_items
COMMIT
```

Holding a database transaction open while doing CPU-bound calculation
work would block a connection for no reason — the transaction should
only wrap the writes.

This mechanism is proven with real rollback/commit behavior against
PostgreSQL in `backend/src/database/__tests__/transaction.integration.test.ts`
(see the final report for whether it was actually executed in this
session).

## `NUMERIC` / `BIGINT` precision boundary

This project already closed the Calculation Core precision contract
(`docs/NUMERIC_PRECISION.md`): financial/measurement values must never
pass through IEEE-754 floating point. That guarantee is only real if the
database adapter also preserves exact values — so this was **verified**,
not assumed:

- `node_modules/postgres/src/types.js` registers parsers only for OIDs
  `21, 23, 26, 700, 701` (`int2`, `int4`, `oid`, `float4`, `float8`)
  under its `number` type. **`NUMERIC` (OID `1700`) and `BIGINT`/`int8`
  (OID `20`) have no registered parser.**
- `node_modules/postgres/src/connection.js` falls back to returning the
  raw UTF-8 wire text (i.e. a plain JS `string`) for any column whose
  type has no registered parser.
- Postgres.js's own README states this explicitly: *"There is currently
  no guaranteed way to handle numeric / decimal types in native
  Javascript. These [and similar] types will be returned as a
  string."* and *"[bigint] doesn't work with `JSON.stringify` out of the
  box, so Postgres.js will return it as a string."*

So, **with zero custom configuration**, Postgres.js already returns
`NUMERIC` and `BIGINT` columns as exact decimal/integer strings — which
is exactly this project's boundary contract. `postgres-client.ts`
deliberately does **not** register a custom type parser for either, and
documents why in its header comment: doing so would risk reintroducing
float/number coercion.

This is verified against a real PostgreSQL connection in
`backend/src/database/__tests__/postgres-client.numeric.integration.test.ts`,
which asserts that `62.5125`, `124025.123456`, `0.08`, and the BIGINT
maximum value (`9223372036854775807`, far beyond
`Number.MAX_SAFE_INTEGER`) all round-trip as exact strings.

Repository row-mapping code **never** calls `Number(...)`, `parseFloat`,
`parseInt`, or unary `+` on a `NUMERIC`-backed or `BIGINT`-backed
column — this is audited (see the final report).

## `BIGINT` / ID boundary

Every `id` column (and every foreign key referencing one) is
`BIGINT GENERATED ALWAYS AS IDENTITY`. A JS `number` cannot safely
represent every possible `BIGINT` value (the safe range is
±2^53−1; `BIGINT` allows up to roughly ±9.2×10^18). Silently converting
an ID to `number` and assuming "IDs will probably stay small forever" is
exactly the kind of unverified assumption this project avoids.

**Decision: all ID fields are `string`** at the domain model and
Repository boundary (`RentalProperty.id`, `Room.id`, `Room.propertyId`,
etc. — see each model file's "ID representation" comment). This matches
Postgres.js's own default `BIGINT` behavior (see above), so no
conversion happens anywhere in the Repository layer — the string that
comes off the wire is the string stored in the domain object.

This required updating the existing domain models' `id`/`...Id` fields
from `number` to `string` (a minimal, mechanical, single-purpose change
— no other fields or logic were touched). `number` remains correct for
non-identity integer columns that are `INTEGER`, not `BIGINT`
(`tenant_count`, `tier_number`, `people_per_quota_unit`,
`fallback_tier_number`, `display_order`) — these fit safely in `number`
and were left unchanged.

No `bigint` (the JS primitive) is used for IDs and none is exposed in a
JSON-facing object — IDs are plain strings end to end, so no special
serialization strategy is needed (unlike Calculation Core's internal
`ExactNumber`/`BigInt`, which never crosses a module boundary at all —
see `docs/NUMERIC_PRECISION.md`).

## Error translation

Repository implementations reuse the project's existing `Result<T>`
contract (`docs/ERROR_HANDLING.md`). Two distinct situations are always
kept separate:

| Situation | Example | Result |
|---|---|---|
| The query ran fine, but no matching domain record exists | No room with that id | A specific not-found code, e.g. `ROOM_NOT_FOUND` |
| The query itself failed (connection, syntax, constraint violation not pre-checked) | Connection drop, unique violation | A generic code, e.g. `DATABASE_READ_FAILED` / `TRANSACTION_FAILED` |

The one documented exception is `InvoiceRepository.findByRoomAndPeriod`:
"no invoice for this room/period" is a normal, expected **success**
outcome (`Result<Invoice | null>`) because the caller is typically
asking "does one already exist?" before deciding whether to create one
— see that interface's own header comment for the full reasoning.

Raw PostgreSQL errors (SQL text that was running, connection details,
stack traces) are **never** put into a `Result`'s `message` — they are
logged server-side only, via `logDatabaseError()`, for developer
debugging. A future write path may inspect a specific PostgreSQL error
code (e.g. unique-violation `SQLSTATE 23505` →
`INVOICE_ALREADY_EXISTS`) at the lowest Repository level, but no generic
PostgreSQL-error-mapping framework is built — that is deferred until a
write path that actually needs it exists (see "Deliberately deferred"
below).

## Least privilege

The backend connects using one `DATABASE_URL` that should be scoped to
only the access this application genuinely needs (read/write on this
project's own tables) — not a Supabase service-role/admin key used for
convenience. Provisioning that specific role is an operational step for
the repository owner in the Supabase dashboard, not something this
codebase can enforce, but the connection string boundary
(backend-only, never sent to the frontend) is enforced by design: no
database credential is ever read by, or transmitted to, frontend code.

## SQL is not a secret; credentials are

The SQL text in this repository (table names, column names, query
shape) is not sensitive — it is visible source code, same as any other
logic, and is expected to be read during an oral defense. What **must**
stay secret is the connection *credential*: `DATABASE_URL` (which
contains a password), any Supabase service-role key. These never appear
in committed files — `backend/.env.example` contains a placeholder
format only (see its own comment), `.env` is git-ignored, and no test or
source file interpolates a real credential.

## Deliberately deferred

This task establishes the persistence *foundation* only. It
deliberately does **not** implement: full CRUD for any domain, a
`CreateInvoiceService`/workflow, REST billing endpoints, a specific
PostgreSQL-error-code-to-domain-error mapping table (beyond what's
described above), `PropertyRepository` (no current read use case needs
it), or any frontend/auth/admin work. These are separate, later,
reviewable tasks.
