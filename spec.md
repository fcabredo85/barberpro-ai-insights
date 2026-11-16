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

### Version 2 increment (see PRD section 11 and `docs/virtual-try-on.md`)

### US-06: Preview a hairstyle on a customer photo
As staff, I can upload a customer photo or take one with the device camera, record the customer's consent, pick one of six styles, and see an AI-edited preview.
**Accept when:** only JPG/PNG/WebP up to 8 MB is accepted and invalid photos show a readable error; Generate stays disabled until a photo is chosen and consent is ticked; changing the photo clears consent and the previous preview; the server records consent and checks quotas (2 per user per minute, 10 per user per day, 60 per shop per day) before sending anything to OpenAI; the preview is labelled as an AI simulation; an unconfigured or failing model shows a retryable message and nothing is sent or saved; a blocked or missing camera explains itself and upload still works.

### US-07: Get a style recommendation without a photo
As staff, I can answer four questions (length on top, styling effort, hair texture, desired look) and receive recommended styles from the catalog.
**Accept when:** all four answers are validated; recommendations only reference styles in the catalog; the photo is never sent; the model's output is validated before display.

### US-08: Save a look
As staff, with the customer's separate storage consent, I can save the original photo and preview, list saved looks, and delete one.
**Accept when:** images go to a private bucket readable only by members of the same barbershop through short-lived signed URLs; a look expires 90 days after saving; deleting removes both images and the record; another shop's user cannot list, read or delete it.

### US-09: Book and complete an appointment
As staff, I can book a barber and service for a customer, optionally from a saved look, then mark the appointment completed, cancelled or no-show.
**Accept when:** only free slots between 10:00 and 21:00 Asia/Manila on a 15-minute grid, up to 60 days ahead, are offered and accepted; two bookings never overlap for the same barber, including simultaneous submissions (the loser gets `slot_taken`, not an error); repeat submissions with the same request key create one appointment; completing records exactly one sale using catalog price and commission rules.

## 4. Screens
1. `/login` — sign in / sign up.
2. `/dashboard` — KPI cards, trend chart, barber/service breakdown, AI Insights panel.
3. `/sales/new` — service, barber, quantity, payment-method form, confirmation.
4. `/sales` — recent transaction table with filterable date range.
5. `/settings` — basic barbershop, barbers and services management.
6. `/` — minimal product introduction with link to login; not the only working screen.
7. `/studio` — photo (upload or camera), consent, style picker, preview with before/after, Hairstyle Advisor, Save Look.
8. `/studio/looks` — saved looks with delete and "Book this style".
9. `/appointments` and `/appointments/new` — day view with status actions; booking form with available times.

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

| POST | `/api/try-on` | 200, preview image | 400 invalid photo or no consent, 413/415 file too large or wrong type, 401/403 auth, 409 duplicate request, 429 quota, 502/503 AI unavailable or not configured |
| POST | `/api/hairstyle-advice` | 200, validated recommendations | 400 invalid answers, 401/403 auth, 409 duplicate request, 429 quota, 503 AI unavailable or invalid output |
| GET, POST | `/api/looks` | 200 list / 201 saved look (200 on duplicate) | 400 invalid input or no storage consent, 401/403 auth, 413/415 file too large or wrong type, 503 storage unavailable |
| DELETE | `/api/looks/:id` | 200, deleted | 401/403 auth, 404 not found, 503 storage unavailable |
| GET | `/api/appointments/availability` | 200, free slots | 400 invalid barber/service/day, 401/403 auth |
| POST | `/api/appointments` | 201 booked (200 on duplicate request key) | 400 invalid input or rule (`outside_hours`, `not_on_slot`, `in_past`, `too_far_ahead`, …), 401/403 auth, 409 `slot_taken` |
| PATCH | `/api/appointments/:id` | 200, new status (completing records the sale) | 400 too early or missing payment method, 401/403 auth, 404 not found, 409 not confirmed or barber/service deactivated |

Catalog and workspace CRUD can use authenticated Server Actions rather than additional public API routes.

## 7. Functional AI behavior
**Input:** date range and the selected authorized workspace, followed by server-calculated aggregated KPIs.
**Output example shape:** `{ "insights": [{ "observation": "...", "evidence": "...", "action": "..." }] }` with exactly 3 items when adequate data is available.
**Trust boundary:** the LLM receives aggregate metrics as data, never direct database access, write permissions, or secret values. Its statements are advisory, not financial facts unless independently computed.

## 8. Out of scope
Actual payments; tax-compliant invoices; inventory; customer loyalty; multi-branch consolidation; paid subscription checkout; SMS reminders. (Booking and AI hairstyle previews were deferred from the MVP and delivered in the Version 2 increment, US-06 to US-09.)

## 9. Test plan
- Unit: calculation `250.00 * 2` at 40% gives revenue `500.00` and commission `200.00`.
- Unit: empty period metrics yield zero totals and no invented sales.
- Unit: malformed AI response is rejected by the output validator.
- Unit: invalid commission outside `0..1` rejected.
- Integration: unauthorized users cannot read or create sales for another barbershop.
- Unit: try-on image validation, consent gating, prompt and output parsing; camera capture and fallback; advisor input/output validation.
- Integration: try-on jobs respect consent and quotas; saved looks are shop-private; bookings reject overlaps, out-of-hours and past times, and simultaneous same-slot bookings return `slot_taken`.
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

8. **Version 2 increment (2026-11-08 to 2026-11-10)**: added Virtual Try-On Studio, AI Hairstyle Advisor, Saved Looks and Appointments (US-06 to US-09). Photos reach OpenAI only after recorded consent and a database quota check (`start_ai_job()`); bookings are protected by a no-overlap exclusion constraint plus a per-barber lock, added after CI caught simultaneous bookings failing with deadlocks (`40P01`).

## 12. Open questions before production (not blockers for assignment)
Actual pricing/retention model, offline POS, Philippine official invoicing, paid subscriptions, data retention, high-volume rate limits, and additional staff roles. These are deferred rather than assumed complete.
