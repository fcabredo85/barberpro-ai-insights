# BarberPro AI Insights: Test Report

**Date:** 2026-11-06 · **Commit under test:** `ebbd75d` plus the review changes listed in §4 (not yet committed) · **Specification:** `spec.md` v1.1 (with decision 7)

## 1. Summary

| Area | Result |
|---|---|
| `npm run lint` | ✅ Pass, 0 errors, 0 warnings |
| `npm run typecheck` | ✅ Pass, 0 errors |
| `npm test` (unit) | ✅ **248 / 248** passed, 13 files, 0 skipped |
| `npm run build` | ✅ Pass, 14 routes |
| `npm run test:integration` (local Supabase) | ✅ **81 / 81** passed, 5 files, 0 skipped |
| Clean-checkout run (no `.env.local`, empty environment, fresh `npm ci`) | ✅ lint, typecheck, test and build all pass |
| End-to-end over HTTP against the built app | ✅ **95 / 95** checks across 6 scripts |
| Credential inspection (tracked files and full Git history) | ✅ No real credentials found; `.env.local` is ignored |

Nothing failed in the final run. During the review, one spec gap and one missing feature were found and fixed (§4). No tests were deleted, skipped or weakened.

## 2. Environment

| Component | Version |
|---|---|
| Node.js / npm | 23.6.0 / 11.6.3 (Next.js 16 requires ≥ 20.9; Node 22 LTS recommended for CI) |
| Next.js / React | 16.4.5 / 19.3 |
| Vitest | 4.1.12 (jsdom 26.1 for UI tests) |
| Supabase CLI / local Postgres | 3.0.0 / Postgres 17 (Docker 29.5.2) |
| AI SDK | `ai` 7.0.150, `@ai-sdk/openai` 4.0.101 |

**Non-production database:** integration tests run only against the **local** Supabase stack (`npx supabase start`). The harness refuses any non-local host unless `ALLOW_REMOTE_TEST_DB=true` is set. Tests use only the anon key and real user sessions, exactly as the app does; the service-role key is never used.

## 3. Commands executed and actual results

```bash
npm run lint              # exit 0  (eslint .)
npm run typecheck         # exit 0  (tsc --noEmit)
npm test                  # exit 0  Test Files 13 passed (13) · Tests 248 passed (248)
npm run test:integration  # exit 0  Test Files 5 passed (5)   · Tests 81 passed (81)
npm run test:coverage     # exit 0  (coverage in §5)
npm run build             # exit 0  ✓ Compiled successfully · 14 routes
```

**Clean-checkout simulation** (what GitHub Actions will see): only Git-tracked and non-ignored files were copied to a separate directory (so no `.env.local`), then the checks ran with an empty environment:

```bash
env -i PATH="$PATH" HOME="$HOME" CI=true npm ci          # exit 0, found 0 vulnerabilities
env -i PATH="$PATH" HOME="$HOME" CI=true npm run lint     # exit 0
env -i PATH="$PATH" HOME="$HOME" CI=true npm run typecheck # exit 0
env -i PATH="$PATH" HOME="$HOME" CI=true npm test         # exit 0, 248 passed
env -i PATH="$PATH" HOME="$HOME" CI=true npm run build    # exit 0
```

This confirms the build needs no secrets.

**End-to-end** (built app + local Supabase + a local fake OpenAI server used through the real `@ai-sdk/openai` client):

| Script | Covers | Result |
|---|---|---|
| `e2e-auth` | Route protection, onboarding redirect, sign-out, bad confirmation link | 12 / 12 |
| `e2e-forms` | Real sign-up, onboarding, login and sign-out form submissions; open-redirect block | 13 / 13 |
| `e2e-m3` | Catalog forms, `POST /api/sales` (401/415/400/201/200/409), receipts, history, deactivation, cross-tenant | 28 / 28 |
| `e2e-m4` | `GET /api/metrics`, dashboard totals = history = persisted rows, empty state, date validation | 15 / 15 |
| `e2e-m5` | `POST /api/ai/insights`: insufficient data, 3 insights, malformed output, outage, 429, payload privacy, no record changes | 22 / 22 |
| `e2e-review` | `GET /api/health`, barbershop rename | 5 / 5 |

Responsive layout was checked from headless-Chrome screenshots at 1440 px and 390 px wide. Layout issues found in earlier milestones were fixed then; none were found in this review.

## 4. Review against spec.md: findings and fixes

| # | Spec reference | Finding | Fix |
|---|---|---|---|
| 1 | §6 Main routes | `GET /api/health` was not implemented. | Added [app/api/health/route.ts](../app/api/health/route.ts). It returns `{ data: { status, service, time } }`, uncached, with no version, environment or dependency details. 3 unit tests and 2 end-to-end checks. |
| 2 | §4 Screens: "`/settings`: basic barbershop … management" | Owners could manage barbers and services but couldn't rename the barbershop. | Added an owner-only rename form and Server Action (Zod-validated; the database allows only the `name` column to change, and only for owners). 3 integration tests: owner can rename; another owner gets a non-disclosing `not_found`; blank name rejected by the database. |

Everything else in §2–§9 was verified as implemented: screens, technical contracts, routes, AI behavior and the test plan.

## 5. Coverage of the requested test categories

| Category | Where | Key cases |
|---|---|---|
| **Commission calculations** | `tests/unit/sale-calculation.test.ts` (48), `tests/integration/sales-and-catalog.test.ts` | Spec case ₱250.00 × 2 at 40% → ₱500.00 / ₱200.00; half-up rounding (₱0.625 → ₱0.63); below-half; no float drift; 0% and 100%; maximum price and quantity; rejects rates outside 0–1 and invalid quantities. The integration suite shows the TypeScript results equal the database's own check constraint on 4 edge cases. |
| **Empty dashboard metrics** | `tests/unit/metrics.test.tsx` (33), `tests/unit/api-metrics-route.test.ts` (12), `tests/integration/metrics.test.ts` (9) | Zero totals, ₱0.00 average, every day zero-filled, empty breakdowns; empty past ranges in a busy shop; KPI cards show ₱0.00; another tenant sees an empty report. |
| **Populated metrics** | same files | Report totals equal independently summed persisted rows (₱1,549.96 / 4 sales / ₱563.30 commission / ₱387.49 average); breakdowns sum to the total; Manila-day bucketing; half-open UTC range. |
| **Zod validation** | `tests/unit/sales-validation.test.ts` (33), `tests/unit/auth-validation.test.ts` (8), `tests/unit/metrics.test.tsx`, API route tests | Sale body is strict: client-supplied price, total, commission or shop ID → 400. Payment method only cash or GCash. Quantity 1–20. UUID request key. Peso and percent parsing. Date ranges (reversed, impossible, more than 366 days). Database report JSON validated before use. |
| **Invalid AI responses** | `tests/unit/ai-insights.test.ts` (34), `tests/unit/api-ai-insights-route.test.ts` (20), `tests/unit/ai-insights-panel.test.tsx` (5) | OpenAI mocked with `MockLanguageModelV4`. **Malformed:** non-JSON text, invalid JSON, 2 or 4 insights, missing or empty fields, wrong types, overlong text; retried once, then a retryable 503. **Unsupported claims:** invented ₱ amounts or %, numbers in actions, unknown fact IDs, "guaranteed", "will definitely", links, emails, duplicates. Provider error and timeout → 503. |
| **Request idempotency** | `tests/unit/api-sales-route.test.ts` (14), `tests/unit/sale-form.test.tsx` (7), `tests/integration/sales-and-catalog.test.ts` (21), `tests/integration/tenant-isolation.test.ts` | Repeat request → 200 with the original sale; same key with different details → 409; **5 concurrent identical requests → exactly 1 sale**; same key in another shop is independent. The browser form reuses the key on network retry and uses a new one after 409. A temporary database-change test showed that removing the unique constraint makes the concurrency test fail. |
| **Authentication (integration)** | `tests/integration/auth-workspace.test.ts` (12) | Sign-up, sign-in, wrong password, minimum password length, sign-out loses access; workspace created atomically with an owner membership; one owned shop per user; no direct inserts. |
| **Cross-tenant access (integration)** | `tests/integration/tenant-isolation.test.ts` (34), `sales-and-catalog.test.ts`, `metrics.test.ts`, `ai-quota.test.ts` (5) | Reads by shop or by exact ID return nothing; writes, edits and self-granted memberships are rejected; another shop's barber or service can't be used; anonymous users are denied everywhere; sales are immutable; server-controlled columns can't be set; snapshot prices must match the active catalog; AI quota can't be consumed for another shop. A temporary leaky RLS policy made these tests fail, so they do detect leaks. |

**Coverage of unit-tested modules** (`npm run test:coverage`, lines): `lib/business` 95%, `lib/validation` 98.5%, `lib/ai` 94.9%. The overall figure is 67%, because modules that need a database (`lib/db/*`, `lib/sales/create-sale.ts`) are tested by the integration suite instead, which isn't included in the coverage report.

## 6. Credential and secret inspection

| Check | Result |
|---|---|
| `git check-ignore -v .env.local .env supabase/.temp/project-ref` | All ignored (`.gitignore:29 .env*`, `supabase/.gitignore:3 .temp`) |
| Tracked env files | Only `.env.example`, which holds placeholders only |
| `git grep` for JWTs, `sk-…`, `sb_secret_…`, `sb_publishable_…`, service-role keys, private keys, the hosted project ref | One match: `sk-test-should-never-appear-0123456789` in `tests/unit/api-ai-insights-route.test.ts`, a deliberately fake value used to prove the API never echoes the key. Not a credential. |
| Same patterns over the **entire Git history** (`git log -p --all`) | Only the same fake test value |
| `supabase/config.toml` | No secret values; only `env(...)` references |
| Client bundles | No client component imports the AI/provider modules; `OPENAI_API_KEY` is read only in the server-only `lib/ai/model.ts` |
| Service-role key | Not used anywhere in the app or tests |

## 7. Tests blocked by unavailable services

| Test | Status | Reason and mitigation |
|---|---|---|
| Live OpenAI request | **Not run** (by design) | Automated tests must mock OpenAI. The real provider client was exercised end to end against a local fake of the Responses API. A first real call still needs to be made manually with a real key. |
| Integration tests against hosted Supabase | **Not run** (by design) | The harness refuses non-local databases to protect real data. The hosted schema was checked read-only: all 5 tables and both RPC functions exist and deny anonymous access. |
| GitHub Actions run | **Blocked** | `.github/workflows/ci.yml` doesn't exist yet (deployment milestone). The clean-checkout run above reproduces the CI steps locally. |
| Live URL in an incognito browser (spec §9, §10) | **Blocked** | The app isn't deployed to Vercel yet. |

## 8. Remaining issues

1. **CI workflow missing** (spec §10): add `.github/workflows/ci.yml` (npm ci, lint, typecheck, test, build; optionally an integration job that starts Supabase).
2. **Not deployed** (spec §10): set up a Vercel project, environment variables (`OPENAI_API_KEY` server-side only), branch protection, and the incognito check.
3. **README not yet rewritten** (spec §10): overview, setup, architecture, environment variable names, tests, links, AI limitations.
4. **Hosted migration history out of sync:** the hosted schema was applied through the SQL Editor. Run `npx supabase migration repair --status applied 20261106010000 20261106010100 20261106020000 20261106030000` before any future `db push`.
5. **Documented deviations from the spec's route table** (deliberate; spec.md not yet updated):
   - `price > 0` instead of `>= 0`, following US-02 "positive peso price";
   - insufficient AI data returns 200 `insufficient_data` instead of 400;
   - an idempotent replay returns 200, and non-JSON requests return 415.
6. **Product limitations, not defects:** sales can't be backdated, so multi-day trends need real use over several days; there's no UI to invite managers, and AI insights are owner-only; real model wording may occasionally fail the strict number check, which returns a retryable 503.
