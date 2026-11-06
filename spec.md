# BarberPro AI Insights — MVP Implementation Specification (Reviewed v1.1)

## 1. Purpose
BarberPro AI Insights helps Philippine barbershop owners record service sales, compute barber commissions, view reliable daily metrics, and receive actionable AI suggestions based on actual business data. This is a scoped graded mini-project; a full multi-branch commercial SaaS is deferred.

## 2. Users and permissions
- **Owner**: registers a barbershop, creates barbers and services, records sales, sees reports and AI insights.
- **Manager**: optional later role with authorized operational access.
- All authenticated requests must be scoped to a verified barbershop membership. Nonmembers receive 403 or a non-disclosing 404. Unauthenticated users receive 401 or a redirect to login depending on route.

## 3. User stories and acceptance criteria

### US-01: Sign in and establish a business workspace
As an owner, I can sign up/sign in with Supabase Auth and create a barbershop.
**Accept when:** logged-out users cannot access private pages; signup and login show errors; created workspace belongs to its creator; a second user cannot read it.

### US-02: Maintain the business catalog
As an owner, I can create, list, and deactivate barbers and services with a positive peso price and valid commission rate.
**Accept when:** missing/invalid names, negative prices, and out-of-range rates show actionable errors; data persists; records belong to the correct business.

### US-03: Record a sale (no payment processing)
As an owner, I can select a barber and service, enter quantity (1–20), choose cash or GCash as the method already paid, and save the sale.
**Accept when:** service/barber are active and belong to the authorized business; price and rate come from server-controlled records; the server calculates `gross = unit_price * quantity` and `commission = gross * rate`; both are rounded to centavos deterministically; the sale is committed once, even after a repeated request key; a success receipt displays the recorded amount.

### US-04: Review a performance dashboard
As an owner, I can view today's sales, transaction count, gross revenue, commission total, and sales by barber and by service.
**Accept when:** data is drawn only from the owner's workspace; an empty dataset displays zeros and an explanatory empty state; time boundaries use Asia/Manila; totals match recorded transactions.

### US-05: Generate AI Business Insights
As an owner, I can request AI analysis of an authorized time period.
**Accept when:** the server computes summary metrics and sends minimal aggregate data to OpenAI; response includes 3 insights (observation, numeric evidence, suggested action) when enough data exists; insufficient data gets an informative response without fabricating results; model errors present a retryable UI state; inputs and model outputs are validated; no API key is exposed to the browser.

## 4. Screens
1. `/login` — sign in / sign up.
2. `/dashboard` — KPI cards, trend chart, barber/service breakdown, AI Insights panel.
3. `/sales/new` — service, barber, quantity, payment-method form, confirmation.
4. `/sales` — recent transaction table with filterable date range.
5. `/settings` — basic barbershop, barbers and services management.
6. `/` — minimal product introduction with link to login; not the only working screen.

## 5. Technical contracts
- Next.js 16 App Router (React 19), strict TypeScript, Tailwind, Recharts, Supabase Auth and Postgres, Vercel AI SDK/OpenAI.
- Use Zod to validate JSON inputs, server-side selected IDs, and structured AI output.
- Private UI uses server-side auth checks; API authorization independently checks membership and RLS.
- Store dates as UTC timestamptz; display/report date ranges in Asia/Manila.
- Database constraints: `price >= 0`, `quantity > 0`, `commission_rate BETWEEN 0 AND 1`, and unique request key per business.
- API response pattern: `{ data: ... }` on success; `{ error: { code, message } }` on failure. Do not leak stack traces.
- Never log API keys, tokens, raw personal information, or request bodies containing secrets.

## 6. Main routes
| Method | Route | Success | Error behavior |
| --- | --- | --- | --- |
| GET | `/api/health` | 200, public health | No internal details |
| POST | `/api/sales` | 201, saved sale receipt | 400 invalid input, 401 unauthenticated, 403 unauthorized, 409 conflict |
| GET | `/api/metrics` | 200, aggregate metrics | 400 invalid dates, 401/403 auth errors |
| POST | `/api/ai/insights` | 200, validated insights | 400 bad request/insufficient data as defined, 401/403 auth, 429 rate limit, 503 upstream failure |

Catalog and workspace CRUD can use authenticated Server Actions rather than additional public API routes.

## 7. Functional AI behavior
**Input:** date range and the selected authorized workspace, followed by server-calculated aggregated KPIs.
**Output example shape:** `{ "insights": [{ "observation": "...", "evidence": "...", "action": "..." }] }` with exactly 3 items when adequate data is available.
**Trust boundary:** the LLM receives aggregate metrics as data, never direct database access, write permissions, or secret values. Its statements are advisory, not financial facts unless independently computed.

## 8. Out of scope
Actual payments; tax-compliant invoices; booking engine; inventory; customer loyalty; multi-branch consolidation; paid subscription checkout; AI hairstyle images; SMS. These belong in version 2+.

## 9. Test plan
- Unit: calculation `250.00 * 2` at 40% gives revenue `500.00` and commission `200.00`.
- Unit: empty period metrics yield zero totals and no invented sales.
- Unit: malformed AI response is rejected by the output validator.
- Unit: invalid commission outside `0..1` rejected.
- Integration: unauthorized users cannot read or create sales for another barbershop.
- E2E/manual: sign in, create service and barber, make a sample sale, verify dashboard and AI panel, check mobile layout.

## 10. CI, deploy, and submission
- Public GitHub repository with at least **five meaningful commits**.
- `.github/workflows/ci.yml` runs on pull requests and main pushes; deploy to production only following successful checks.
- Vercel hosts web UI; Supabase hosts auth/data; env vars defined in Vercel, never committed. Use separate non-production credentials where feasible.
- Validate live URL in an incognito browser, login, sale flow, and AI analysis.
- README includes overview, setup, architecture, environment variable names, tests, public repo/live links, and AI limitations.
- Record a **two-minute demo**, write a **one-page reflection**, and create one GitHub issue for a version 2 improvement.

## 11. Review log and decisions
1. **Reduced scope** from 12 planned modules to sales, commissions, dashboard, and AI insights for feasibility.
2. **Excluded live payment processing** because the assignment specifically prohibits it; cash/GCash are recording options only.
3. **Specified AI grounding** in server-computed aggregates to avoid a generic chatbot wrapper.
4. **Specified tenant and RLS security** instead of relying on user-controlled workspace IDs.
5. **Added testable acceptance criteria** and at least three unit tests, five commits, live deployment, and documentation checklist.
6. **Clarified technology**: Next.js 14 was originally chosen for compatibility with the assignment's suggested stack, subject to dependency/security review. Superseded by decision 7.
7. **Upgraded to Next.js 16 (2026-11-06)**: the dependency review found unpatched critical/high advisories in Next.js 14.2.33 (the final 14.x release), fixable only by a major upgrade. The app now uses Next.js 16.4.5, React 19, ESLint 9 flat config (`eslint .`, since `next lint` was removed) and Vitest 4, and requires Node.js >= 20.9 (Node 22 LTS recommended). The App Router architecture and all other contracts are unchanged; the brief lists its stack as recommendations, not requirements.

## 12. Open questions before production (not blockers for assignment)
Actual pricing/retention model, offline POS, Philippine official invoicing, paid subscriptions, data retention, high-volume rate limits, and additional staff roles. These are deferred rather than assumed complete.
