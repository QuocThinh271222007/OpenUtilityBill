# Error Handling

This document describes how OpenUtilityBill represents success and
failure, and why. It intentionally stays small — see
`docs/LEARNING_NOTES.md` for the reasoning behind avoiding a bigger error
framework.

## 1. The problem with `return false`

A function that returns `false` on failure throws away the *reason* for
the failure. Callers cannot distinguish "room not found" from "database
unreachable" from "invalid input" without inventing ad-hoc conventions.
This project avoids that pattern for any meaningful failure.

## 2. The `Result<T>` contract

Defined once, in `backend/src/shared/result.ts`:

```ts
export interface ResultError {
  code: string;
  message: string;
}

export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: ResultError };
```

Every Service, business module, and Repository function that can fail
meaningfully returns `Result<T>` instead of throwing, returning `null`, or
returning `false`. This forces callers to check `success` before touching
`data` — TypeScript's discriminated union narrowing makes the unchecked
case a compile error in strict mode.

Two small helpers keep call sites readable:

```ts
ok(data)                    // → { success: true, data }
fail(code, message)         // → { success: false, error: { code, message } }
```

## 3. Success contract (HTTP)

```json
{
  "success": true,
  "data": { }
}
```

## 4. Failure contract (HTTP)

```json
{
  "success": false,
  "error": {
    "code": "ROOM_NOT_FOUND",
    "message": "Room could not be found."
  }
}
```

## 5. Error code naming

Error codes are `UPPER_SNAKE_CASE`, domain-specific, and describe *what*
failed, not *how* (no HTTP status codes or stack traces embedded in the
code). The invoice REST API (`docs/API.md`) now wires several of these
to real logic — `POST`/`GET /api/v1/invoices` map every one of them to
an HTTP status via one small table
(`backend/src/modules/invoice/invoice.http.ts`,
`mapResultErrorCodeToHttpStatus` — see `docs/API.md` "HTTP status
mapping" for the full table, including Calculation Core's own
`INVALID_*` codes not repeated here):

- `VALIDATION_ERROR` — Service-level input shape validation (e.g.
  `roomId`, `billingPeriod`, billing methods, `actualChargedAmount`
  scale).
- `ROOM_NOT_FOUND`
- `METER_READING_NOT_FOUND`
- `INVALID_METER_READING`
- `TARIFF_NOT_FOUND`
- `AMBIGUOUS_TARIFF_CONFIGURATION`
- `INVOICE_ALREADY_EXISTS`
- `INVOICE_NOT_FOUND` — `GetInvoiceService`, no persisted invoice for
  the given (roomId, billingPeriod).
- `TRANSACTION_FAILED`
- `DATABASE_READ_FAILED` / `DATABASE_WRITE_FAILED`
- `INTERNAL_ERROR` — an unexpected (non-`Result`) exception caught at
  the Controller boundary; never a raw stack trace in the response.

## 6. Fail-fast pipeline

A Service coordinating multiple steps stops at the first failure and
returns it immediately — it never lets a later step run on top of a
failed earlier step:

```
Module A → PASS
Module B → PASS
Module C → FAIL
STOP. Return Module C's error. Do not run Module D.
```

Concretely in TypeScript, this looks like an early return on every
intermediate `Result`:

```ts
const roomResult = await loadRoom(roomId);
if (!roomResult.success) {
  return roomResult; // stop the pipeline, propagate the exact error
}

const tariffResult = await loadTariff(roomResult.data.tariffId);
if (!tariffResult.success) {
  return tariffResult;
}

// continue only once every required step has succeeded
```

This is why the health Controller
(`backend/src/modules/health/health.controller.ts`) checks
`result.success` before reading `result.data`, even though the current
health Service cannot actually fail yet — the pattern is established here
so every future module follows the same shape.

## 7. Expected vs. unexpected errors

- **Expected / domain errors** (e.g. room not found, invalid tariff
  configuration): represented as `Result` failures with a specific error
  code. These are normal outcomes of a workflow, not bugs.
- **Unexpected / internal errors** (e.g. a thrown exception from a
  library, a programming mistake): not modelled as domain `Result`
  failures. They should be caught at the Controller boundary and turned
  into a generic `500` response with a generic code (e.g.
  `INTERNAL_ERROR`), never re-thrown into the HTTP response as a stack
  trace.

## 8. User-facing message vs. developer diagnostic

- The `message` field in an error response must be understandable by an
  end user (or at least not alarming/technical).
- The `code` field is what developers and support use to identify exactly
  which check failed, without needing to parse the message text.
- Stack traces and internal exception details are never sent to the
  client. They belong in server-side logs only.

## 9. What this project deliberately does not do

- No custom `Error` subclass hierarchy (e.g. `RoomNotFoundError extends
  DomainError extends AppError`). A plain `{ code, message }` object is
  enough to identify and communicate a failure, and is far easier to read
  in a review or an oral defense than a class tree.
- No global exception-handling framework or decorators. Controllers use
  a plain early-return check on `result.success`.
