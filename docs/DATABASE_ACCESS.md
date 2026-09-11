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
read (and, for `InvoiceRepository` only, written) in domain terms — e.g.
`RoomRepository.findById(id): Promise<Result<Room>>`. The interface has
no SQL and no Postgres.js import.

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

`InvoiceRepository` is the one repository with write methods
(`createInvoice`, `createInvoiceItems`), added for
`CreateInvoiceService` — see `docs/CREATE_INVOICE_WORKFLOW.md`. Write
inputs use dedicated `NewInvoice`/`NewInvoiceItem` types, not
`Omit<Invoice, ...>`/`Partial<Invoice>`, so the write contract stays
readable on its own instead of being inferred from the read model.

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
`runInTransaction` is called, not inside it. This shape is now
implemented by `CreateInvoiceService`
(`backend/src/modules/invoice/create-invoice.service.ts`) — see
`docs/CREATE_INVOICE_WORKFLOW.md`:

```
load required data (Repository reads)
        ↓
validate + calculate (Calculation Core — pure, no I/O)
        ↓
BEGIN  (runInTransaction, via InvoiceUnitOfWork)
  insert invoice
  insert invoice_items
COMMIT
```

Holding a database transaction open while doing CPU-bound calculation
work would block a connection for no reason — the transaction should
only wrap the writes.

**`InvoiceUnitOfWork`** (`backend/src/repositories/invoice-unit-of-work.ts`,
Postgres implementation
`backend/src/repositories/postgres/postgres-invoice-unit-of-work.ts`) is
a small interface — one method, `run(work)` — that hides `runInTransaction`/
`DatabaseExecutor`/`PostgresInvoiceRepository` from `CreateInvoiceService`.
The Postgres implementation constructs a `PostgresInvoiceRepository`
bound to the transaction context and passes it to `work`, so
`createInvoice` and `createInvoiceItems` always run against the SAME
transaction. This is deliberately not a general Unit-of-Work framework
(no multi-repository support, no nested transactions) — `CreateInvoice`
is the only write workflow that exists.

This mechanism is exercised with real rollback/commit assertions against
PostgreSQL in
`backend/src/database/__tests__/transaction.integration.test.ts` — a
genuine `TEST_IMPLEMENTED` (the test exists, is correct, and will run
whenever `DATABASE_URL` is supplied). Whether it has actually been
`TEST_RUNTIME_EXECUTED` (run against a live database and observed to
pass) is a separate claim, tracked per-session in the task that added or
last touched this test — do not treat "the test exists" as "the test has
run." Distinguishing these two is deliberate project policy: this
project never reports a runtime PASS that was not actually observed.

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

`backend/src/database/__tests__/postgres-client.numeric.integration.test.ts`
asserts this against a real PostgreSQL connection when one is available —
`62.5125`, `124025.123456`, an unscaled `0.08`, a **fixed-scale**
`NUMERIC(p, s)` expression (matching how the real schema's columns are
declared — e.g. `NUMERIC(5, 4)` reads back as `"0.0800"`, not `"0.08"`;
see "NUMERIC string format is not canonicalized" below), and the BIGINT
maximum value (`9223372036854775807`, far beyond
`Number.MAX_SAFE_INTEGER`) are all asserted to round-trip as exact
strings. As with the transaction test above, this is `TEST_IMPLEMENTED`
— whether it has been `TEST_RUNTIME_EXECUTED` in a given session depends
on whether `DATABASE_URL` was available; that distinction is reported
explicitly in each task's final report rather than assumed.

### NUMERIC string format is not canonicalized

The Repository layer passes through whatever exact string PostgreSQL
sends — it does **not** reformat it (e.g. stripping trailing zeros).
`electricity_tariffs.electricity_vat_rate` is `NUMERIC(5, 4)`, so a row
read from it has `electricityVatRate === "0.0800"`, not `"0.08"` — both
strings represent the identical exact value, and `parseDecimal` in
Calculation Core (`docs/NUMERIC_PRECISION.md`) accepts either form
identically. This is a deliberate simplicity choice, not an oversight:
canonicalizing decimal strings would mean writing (and maintaining) a
zero-trimming function in the Repository layer for no correctness
benefit — Calculation Core already normalizes any valid decimal string
to a reduced exact fraction the moment it parses one, so canonical
*formatting* only matters at a final display/output boundary, if and
when one needs it, not at the Repository read boundary.

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

## `DATE` boundary — reviewed, not changed (future consideration)

`billing_period`, `effective_from`, and `effective_to` are PostgreSQL
`DATE` columns (a calendar day, with no time-of-day or timezone
component). The Repository layer currently represents them as JS `Date`
objects, matching the existing domain models
(`docs/DOMAIN_MODEL.md`) and Postgres.js's built-in `date` type handler
(OID `1082`/`1114`/`1184`, parsed via `new Date(x)`).

This was reviewed for a specific risk: Postgres.js serializes an
outgoing JS `Date` parameter as a `timestamptz` (OID `1184`, via
`.toISOString()`), not as a `date`. When that parameter is compared
against a `DATE` column (e.g. `WHERE billing_period = ${someDate}`),
PostgreSQL casts the column's `date` value to `timestamptz` using the
**session's timezone** to do the comparison — not necessarily UTC. If
that session timezone were ever something other than UTC, a `Date`
meant to represent "2026-09-01" could, in principle, fail to match a
`billing_period` of `2026-09-01`, or match the wrong row, depending on
the offset.

**This is a theoretical risk, not a demonstrated bug.** No live
PostgreSQL connection was available to actually test it in the tasks
that built this layer, and Supabase-hosted PostgreSQL databases default
their session timezone to UTC, which would make this a non-issue in
practice for this project's actual deployment. No code change was made
based on this review, per instruction: only a demonstrated defect
justifies changing behavior, not a theoretical one.

**Future boundary consideration:** if this is ever a concern (e.g. the
database's timezone configuration changes, or a future API boundary
needs to accept/return dates), the more robust fix is to stop relying on
JS `Date` + implicit timezone-dependent casting entirely for `DATE`
columns, and instead use canonical `YYYY-MM-DD` strings at the
Repository parameter/return boundary (parsed/formatted explicitly,
never through `Date`'s local-timezone-sensitive methods like
`getDate()`/`getMonth()`). This would need its own small task, not a
change bundled into unrelated work.

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
debugging.

`PostgresInvoiceRepository.createInvoice` inspects one specific
PostgreSQL error code — unique-violation `SQLSTATE 23505` (the
`UNIQUE(room_id, billing_period)` constraint) — and translates it to
`INVOICE_ALREADY_EXISTS`, because `CreateInvoiceService`
(`backend/src/modules/invoice/create-invoice.service.ts`) genuinely
needs this specific mapping to protect against a race condition its own
pre-check cannot fully prevent (see
`docs/CREATE_INVOICE_WORKFLOW.md` "Duplicate invoice / race
condition"). This is the **only** SQLSTATE mapping in the codebase —
still no generic PostgreSQL-error-mapping framework is built. Any other
write failure (including a different constraint violation) falls
through to the generic `DATABASE_WRITE_FAILED`.

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

The persistence foundation, plus the first complete write workflow
(`CreateInvoiceService`, see `docs/CREATE_INVOICE_WORKFLOW.md`), are
now implemented. Still deliberately **not** implemented: any Express
route/Controller calling this Service (no REST billing endpoint
exists), full CRUD for `RentalProperty`/`Room`/`MeterReading`/
`ElectricityTariff`/`WaterTariff` (create/update/delete — only reads
and the one `CreateInvoice` write path exist), `PropertyRepository` (no
current read use case needs it), a generic
PostgreSQL-error-code-to-domain-error mapping table (beyond the one
`SQLSTATE 23505` case described above), and any frontend/auth/admin
work. These are separate, later, reviewable tasks.
