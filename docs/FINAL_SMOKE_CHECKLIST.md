# Final smoke checklist (owner-run, manual)

**Status: NOT executed by any agent.** This session had no browser
automation tool enabled (Claude in Chrome was installed but not enabled
for this session, and no Playwright/Cypress/Selenium was introduced —
adding one was explicitly out of scope for this task). Every non-browser
runtime proof in this closure pass (real PostgreSQL, real transactions,
real Repository reads/writes, real invoice HTTP API, backend/frontend
typecheck+build, backend health, frontend dev server + Vite `/api`
proxy) was executed for real against the live database — see the final
runtime closure report for exact evidence. **Only the in-browser click-
through below remains unverified by an agent.** The repository owner
must run this checklist and confirm the result before treating the
mandatory browser UI as release-ready.

## Prerequisites

1. `cd backend && cp .env.example .env` and fill in a real
   `DATABASE_URL` (Supabase Postgres, migrations 001+002 and seed
   `001_competition_defaults.sql` already applied). Never commit this
   file.
2. `cd backend && npm install && npm run build && npm start` (or
   `npm run dev`) — confirm `GET http://localhost:3000/api/v1/health`
   returns `{"success":true,"data":{"status":"ok"}}`.
3. In a second terminal: `cd frontend && npm install && npm run dev` —
   note the printed local URL (`http://localhost:5173` or the next free
   port Vite reports).

## Checklist

1. [ ] Open the frontend URL in a browser. The app shell and sidebar
       navigation render with no blank page.
2. [ ] Create a new property (Properties screen) with a name and
       address; it appears in the property list immediately after
       creation.
3. [ ] Select that property, create a new room with `tenantCount = 4`;
       it appears under the property.
4. [ ] Select that room. Enter an electricity meter reading for a
       clean test billing month: previous `0`, current `120`.
5. [ ] Enter a water meter reading for the same billing month:
       previous `0`, current `12`.
6. [ ] Open the electricity tariff configuration screen — confirm the
       seeded "Competition Default Electricity Tariff" (6 tiers) is
       visible and its values render correctly (VAT `0.0800`,
       quota/person `4`, fallback tier `3`).
7. [ ] Open the water tariff configuration screen — confirm the seeded
       "Competition Default Water Tariff" is visible with its price/VAT/
       environmental-fee values.
8. [ ] Create an invoice for the room/billing month using
       `QUOTA_TIERED` (electricity) + `PER_CUBIC_METER` (water).
9. [ ] Verify the invoice breakdown renders line items for every tier
       consumed plus VAT/fee lines, not just a single total.
10. [ ] Verify the displayed legal total matches what the breakdown
        line items sum to (no silent rounding/mismatch visible).
11. [ ] Supply an actual charged amount different from the legal total
        (e.g. a few hundred VND higher or lower) and confirm the
        app shows the billing difference and which side is higher.
12. [ ] Navigate away, then reopen the same persisted invoice (via the
        invoice list/history) — confirm it shows the same breakdown
        without recalculating (no flash of different numbers).
13. [ ] Resize the browser to a narrow/mobile viewport (~375px) —
        confirm the responsive nav opens and closes correctly and no
        layout breaks.
14. [ ] With the browser DevTools console open throughout steps 1–13,
        confirm there are no uncaught JS errors or unhandled promise
        rejections logged.
15. [ ] Confirm every financial/measurement value shown (meter
        readings, tariff prices, invoice amounts) displays as an exact
        decimal string with no visible floating-point artifacts (e.g.
        no `120.00000001`-style values).
16. [ ] Clean up the test property/room/invoice created in steps 2–8
        (or note that they are intentionally left as manual smoke-test
        data) before considering this checklist complete.

## After running this checklist

Record the result (pass/fail, and any defect found) before proceeding
to any merge/tag/release step. This checklist does not itself authorize
a merge to `main`, a tag, or a GitHub Release — those remain separate,
explicit, owner-approved actions.
