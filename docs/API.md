# API

This document is the REST contract for the endpoints that currently
exist. It complements `docs/CREATE_INVOICE_WORKFLOW.md` (the underlying
Service logic) and `docs/ERROR_HANDLING.md` (the general success/error
contract).

This document covers the invoice workflow endpoints
(`POST`/`GET /api/v1/invoices`). Property/room/meter-reading/tariff
management endpoints are documented separately in
`docs/MANAGEMENT_API.md` — the two documents share the same
conventions (IDs, decimal-string contract, error contract) described
below. No authentication and no frontend consumes this API yet — do
not assume otherwise from either document.

## Base path

Every endpoint is versioned under `/api/v1` (see `backend/src/app.ts`).

## Conventions used throughout

- **IDs** (`roomId`, `id`, every `...Id` field): decimal-digit strings,
  never JSON numbers — the underlying column is `BIGINT`, which a JS
  `number` cannot safely represent in full (see `docs/DATABASE_ACCESS.md`
  "BIGINT / ID boundary").
- **Financial values** (`calculatedTotal`, `actualChargedAmount`,
  `amount`, `unitPrice`, `quantity`, `billingDifference`, and every
  Calculation Core numeric field): decimal strings, never JSON numbers.
  A value may come back at the database's declared `NUMERIC` scale
  (e.g. `"366994.00"`, not `"366994"`) — this is the same exact value,
  not a precision bug, and the API does **not** reformat it for
  cosmetics (see `docs/DATABASE_ACCESS.md` "NUMERIC string format is
  not canonicalized"). Clients must not run `Number(...)`/
  `parseFloat(...)` on these fields for anything other than display
  formatting that tolerates trailing zeros.
- **`billingPeriod` wire format**: `"YYYY-MM-DD"` (e.g. `"2026-09-01"`),
  always the first day of a month. Never a full ISO-8601 timestamp on
  the wire — see "Date contract" below.
- **`createdAt`**: a full ISO-8601 timestamp string (e.g.
  `"2026-09-10T12:34:56.000Z"`).
- **Success contract**: `{ "success": true, "data": ... }`.
- **Error contract**: `{ "success": false, "error": { "code": "...", "message": "..." } }`
  — see `docs/ERROR_HANDLING.md`. `message` is never a raw PostgreSQL
  error, constraint name, SQL text, or stack trace.

## Date contract

`billingPeriod` on the wire is **always** `"YYYY-MM-DD"` — never a full
timestamp, never a JS-parseable arbitrary date string. The Controller
(`backend/src/modules/invoice/invoice.http.ts`,
`parseBillingPeriodWireFormat`) enforces, in order:

1. The value is a string.
2. It matches exactly `^\d{4}-\d{2}-\d{2}$`.
3. It is a real calendar date (`"2026-02-30"` is rejected — JS `Date`
   would otherwise silently roll it over to March instead of erroring).
4. Its day is `01` — a billing period is always the first day of a
   month, matching migration 001's
   `CHECK (EXTRACT(DAY FROM billing_period) = 1)`.

A valid value is parsed into a UTC-midnight `Date`
(`"2026-09-01"` → `2026-09-01T00:00:00.000Z`), matching the existing
`CreateInvoiceService`/`GetInvoiceService` contract. Any failure returns
`400 VALIDATION_ERROR` — examples that are rejected:
`"2026-9-1"`, `"2026-09-02"` (not the first of the month),
`"2026-02-30"` (not a real date), `"2026-09-01T10:00:00Z"` (has a time
component).

This is a **wire-format** decision only — it does not change the
Repository/domain `Date` boundary reviewed (and deliberately left
unchanged) in `docs/DATABASE_ACCESS.md` "DATE boundary".

## `POST /api/v1/invoices`

Creates a new invoice for a room/billing period, running the full
`CreateInvoiceService` workflow (see `docs/CREATE_INVOICE_WORKFLOW.md`).

### Request body

```json
{
  "roomId": "1",
  "billingPeriod": "2026-09-01",
  "electricityBillingMethod": "QUOTA_TIERED",
  "waterBillingMethod": "PER_CUBIC_METER",
  "actualChargedAmount": null
}
```

| Field | Type | Notes |
|---|---|---|
| `roomId` | string | Required. Positive `BIGINT`-shaped decimal string. |
| `billingPeriod` | string | Required. `"YYYY-MM-DD"`, first of month — see "Date contract". |
| `electricityBillingMethod` | string | Required. `"QUOTA_TIERED"` \| `"FALLBACK_TIER_FLAT"`. |
| `waterBillingMethod` | string | Required. `"PER_CUBIC_METER"` \| `"PER_PERSON"`. |
| `actualChargedAmount` | string \| null | Optional (defaults to `null`). See "actualChargedAmount scale corrective" below. |

The Controller only checks that these fields are *present and the right
JS type* (string / string-or-null) and parses `billingPeriod`; it does
**not** check that `roomId` is a valid BIGINT shape or that the methods
are valid enum members — that is `CreateInvoiceService`'s job
(`VALIDATION_ERROR` either way), keeping business validation out of the
Controller.

### `actualChargedAmount` scale corrective

`invoices.actual_charged_amount` is `NUMERIC(14, 2)`. Before this
corrective, `CreateInvoiceService` would accept an arbitrary exact
decimal (e.g. `"367000.123456"`), compute `billingDifference` from the
full value, and then let PostgreSQL silently round it to `"367000.12"`
on write — so the returned `billingDifference` and the persisted
`actualChargedAmount` would describe two different source values. This
is now rejected **before any Repository read**:

- Must be a non-negative decimal string.
- At most 12 integer digits, at most 2 fractional digits (so it always
  fits `NUMERIC(14, 2)` without rounding).
- Never parsed through `Number(...)`/`parseFloat(...)` — checked by
  shape (regex) only (`backend/src/modules/invoice/invoice-input-validation.ts`,
  `isValidActualChargedAmountScale`).

| Value | Result |
|---|---|
| `"0"`, `"480000"`, `"480000.5"`, `"480000.50"`, `"999999999999.99"` | valid |
| `"-1"`, `"12.345"`, `"367000.123456"`, `"1000000000000"`, `"abc"`, `""` | `400 VALIDATION_ERROR` |

### Success response — `201 Created`

```json
{
  "success": true,
  "data": {
    "invoice": {
      "id": "42",
      "roomId": "1",
      "billingPeriod": "2026-09-01",
      "tenantCountUsed": 4,
      "electricityTariffId": "10",
      "waterTariffId": "20",
      "electricityBillingMethod": "QUOTA_TIERED",
      "waterBillingMethod": "PER_CUBIC_METER",
      "electricityReadingId": "200",
      "waterReadingId": "300",
      "calculatedTotal": "366994.00",
      "actualChargedAmount": "367000.12",
      "createdAt": "2026-09-10T12:34:56.000Z"
    },
    "items": [
      { "id": "1", "invoiceId": "42", "category": "ELECTRICITY_TIER", "tierNumber": 1, "quantity": "50", "unitName": "kWh", "unitPrice": "1984.00", "amount": "99200", "description": "Bậc điện 1", "displayOrder": 1 }
    ],
    "electricity": { "method": "QUOTA_TIERED", "result": { "usageKwh": "120", "...": "..." } },
    "water": { "method": "PER_CUBIC_METER", "...": "..." },
    "invoiceTotal": { "exactTotal": "366994", "roundedTotalVnd": "366994" },
    "billingDifference": "6.12"
  }
}
```

`electricity`/`water`/`invoiceTotal` are the full Calculation Core
result objects (`backend/src/calculation/types/calculation.types.ts`)
returned as-is — every field is already a `string`/`number`, no `Date`
or `bigint`, so no separate serialization step is needed for them.

## `GET /api/v1/invoices`

Reads back a **persisted, historical** invoice — it does **not**
recalculate electricity/water. See `docs/CREATE_INVOICE_WORKFLOW.md`
"Room snapshot" for why a historical invoice must never silently change
when current tariff/tenant-count configuration changes.

### Query parameters

| Parameter | Type | Notes |
|---|---|---|
| `roomId` | string | Required. |
| `billingPeriod` | string | Required. `"YYYY-MM-DD"` — same rules as POST. |

```
GET /api/v1/invoices?roomId=1&billingPeriod=2026-09-01
```

### Success response — `200 OK`

```json
{
  "success": true,
  "data": {
    "invoice": { "...": "same shape as POST's invoice" },
    "items": [ "...": "same shape as POST's items, ORDER BY display_order ASC" ],
    "billingDifference": "6.12"
  }
}
```

`billingDifference` is computed on demand from the two persisted values
(`invoice.calculatedTotal`, `invoice.actualChargedAmount`) — it is
**not** stored, and is `null` when `actualChargedAmount` is `null`.

## Error responses

```json
{ "success": false, "error": { "code": "ROOM_NOT_FOUND", "message": "Không tìm thấy room với id = 1." } }
```

### HTTP status mapping

A small, explicit table, now shared by every HTTP module in the backend
(`backend/src/shared/http/result-error-status.ts`,
`mapResultErrorCodeToHttpStatus` — the invoice module's own
`invoice.http.ts` re-exports it unchanged so existing imports keep
working) — not a generic error framework. Any `Result` error code not
listed here maps to `500` (never guessed as a 4xx for an unrecognized
situation).

| Status | Codes |
|---|---|
| `400` | `VALIDATION_ERROR`, `INVALID_ACTUAL_CHARGED_AMOUNT` |
| `404` | `ROOM_NOT_FOUND`, `METER_READING_NOT_FOUND`, `TARIFF_NOT_FOUND`, `INVOICE_NOT_FOUND`, `PROPERTY_NOT_FOUND` |
| `409` | `INVOICE_ALREADY_EXISTS`, `ROOM_ALREADY_EXISTS`, `METER_READING_ALREADY_EXISTS`, `METER_READING_IN_USE`, `TARIFF_ALREADY_EXISTS`, `TARIFF_PERIOD_OVERLAP`, `TARIFF_IN_USE` |
| `422` | `AMBIGUOUS_TARIFF_CONFIGURATION`, `TARIFF_CONFIGURATION_INVALID`, `INVALID_QUOTA`, `INVALID_TENANT_COUNT`, `INVALID_PEOPLE_PER_QUOTA_UNIT`, `INVALID_METER_READING`, `INVALID_METER_MAXIMUM`, `METER_MAXIMUM_REQUIRED`, `FALLBACK_TIER_NOT_FOUND`, `INVALID_WATER_METHOD`, `INVALID_WATER_RATE`, `INVALID_VAT_RATE`, `INVALID_DECIMAL`, and the `validateElectricityConfig` tier-structure codes (`EMPTY_TARIFF`, `INVALID_TIER_NUMBER`, `DUPLICATE_TIER_NUMBER`, `INVALID_TIER_PRICE`, `INVALID_TIER_THRESHOLD`, `NO_UNLIMITED_TIER`, `MULTIPLE_UNLIMITED_TIERS`, `UNLIMITED_TIER_NOT_LAST`) |
| `500` | `DATABASE_READ_FAILED`, `DATABASE_WRITE_FAILED`, `TRANSACTION_FAILED`, `INTERNAL_INVARIANT_VIOLATION`, `INTERNAL_ERROR` (unexpected throw caught at the Controller boundary), and any unrecognized code |

The `404`/`409`/`422` codes added in this row (`PROPERTY_NOT_FOUND`,
`ROOM_ALREADY_EXISTS`, `METER_READING_ALREADY_EXISTS`,
`METER_READING_IN_USE`, `TARIFF_ALREADY_EXISTS`,
`TARIFF_PERIOD_OVERLAP`, `TARIFF_IN_USE`, `INVALID_PEOPLE_PER_QUOTA_UNIT`,
and the tier-structure codes) are only reachable through the management
endpoints — see `docs/MANAGEMENT_API.md`.

`409 INVOICE_ALREADY_EXISTS` covers both the normal case (the Service's
own pre-check) and the race-condition case (a real `SQLSTATE 23505`
translated by `PostgresInvoiceRepository.createInvoice`) — see
`docs/CREATE_INVOICE_WORKFLOW.md` "Duplicate invoice / race condition".

### What is never sent to the client

SQL text, PostgreSQL constraint names, `DATABASE_URL` or any connection
detail, stack traces. An unexpected (non-`Result`) exception reaching
the Controller is caught and turned into a generic
`500 { "code": "INTERNAL_ERROR" }` — the real error is logged
server-side only (`console.error`), never serialized into the response.

## No SQL exposure / security notes

- `express.json()` parses the request body; no other body-parsing
  middleware is added.
- Every value that reaches SQL is parameterized by Postgres.js
  (`${value}` in a tagged template) — the Controller/Service layers
  never see or construct SQL at all (`SQL_IN_CONTROLLER=0`,
  `SQL_IN_SERVICE=0` — see the corrective task's audit).
- Neither `invoice.controller.ts` nor `create-invoice.service.ts`/
  `get-invoice.service.ts` imports Postgres.js or `DatabaseExecutor` —
  only `backend/src/composition/invoice.composition.ts` (the
  composition root) and the `postgres/postgres-*.repository.ts` files
  do.

## Composition / dependency wiring

`backend/src/composition/invoice.composition.ts` is the only place that
constructs the real (Postgres-backed) `CreateInvoiceService`/
`GetInvoiceService`. It is **lazy**: `getDatabaseClient()` is called
only inside each factory function, and each factory function is called
only *after* the Controller has finished validating the request — never
at module-import time. This means:

- Importing `app.ts` (which mounts `invoice.routes.ts`, which imports
  the composition module) never touches the database.
- `GET /api/v1/health` keeps working with no `DATABASE_URL` set.
- A malformed `POST`/`GET /api/v1/invoices` request (bad JSON shape,
  bad `billingPeriod`) still returns a proper `400`, not a `500`, even
  with no `DATABASE_URL` configured — because validation runs before
  the Service is constructed.
- Only a request that actually needs to read/write the database (valid
  shape, reaches `service.execute(...)`) depends on `DATABASE_URL`
  being configured; if it is not, that request gets a `500` (not a
  crash).

## What is not implemented

DELETE for any resource (by design — see `docs/MANAGEMENT_API.md` "No
DELETE endpoints"), authentication, role-based authorization, and a
separate role-gated admin/user area. Property/Room/MeterReading/Tariff
management (list/create/update) **is** implemented — see
`docs/MANAGEMENT_API.md` — and a full mandatory browser UI now consumes
this API end to end, including tariff configuration — see
`docs/FRONTEND.md`.
