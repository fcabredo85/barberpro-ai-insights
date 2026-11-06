# agents.md

## Project Overview
BarberPro AI Insights is an AI-powered barbershop sales and business-insights dashboard built for owners and managers. The MVP includes secure workspace access, barber/service setup, recording externally completed service sales, commission reporting, and AI insights from aggregated data.

## Commands
These assume the Next.js repository has been scaffolded with corresponding npm scripts. Execute from project root.
```bash
# Initial install and environment
npm ci
cp .env.example .env.local

# Development
npm run dev

# Unit and integration tests (Vitest)
npm test
npm run test:coverage

# Quality checks
npm run lint
npm run typecheck

# Production build and local smoke test
npm run build
npm run start

# Supabase local development (CLI installed/configured)
npx supabase start
npx supabase migration new change_description
npx supabase db reset  # ONLY local: destroys local data

# CI: runs npm ci, lint, typecheck, tests, build
# Deploy: Vercel Git integration after checks on main;
# manage deployment environment variables in Vercel dashboard.
```

## Architecture
- `/app` — App Router pages, layouts, server actions and `/api` route handlers
- `/components` — UI and charts
- `/lib/auth` — server authentication, authorization and role checks
- `/lib/db` — Supabase clients and tenant-scoped repositories
- `/lib/business` — pricing and commission calculations
- `/lib/ai` — AI insight generation, prompt templates and output validation
- `/lib/validation` — Zod request/response schemas
- `/supabase/migrations` — schema, policies and constraints
- `/tests` — unit and API integration tests
- `/.github/workflows` — CI definitions

## Constraints
1. Confirm authenticated Supabase session and membership for every private route and mutation.
2. Enable and test PostgreSQL RLS on all tenant-owned tables; never trust browser-supplied tenant IDs.
3. Store OpenAI credentials and any elevated database keys only in server-side environment variables.
4. Perform sale and commission calculations server-side with exact currency values and idempotent transactions.
5. AI may read only non-sensitive aggregates; never invent observed figures or access another tenant's data.
6. Do not implement live payment processing or issue purported official tax invoices in the assignment MVP.

## Testing
- Framework: Vitest for domain and UI-unit logic; React Testing Library for components; integration tests for protected routes and RLS (against a test Supabase project/local instance).
- Target: >=80% coverage for pure calculation, validation and AI parsing modules; access-control tests are mandatory regardless of overall coverage.
- Minimum assignment requirement: at least 3 unit tests, including `sales math`, `empty report`, and `invalid AI response`.
- Add test cases for unauthenticated access, cross-tenant access, duplicate transaction requests, bad form values and upstream AI failures.
- `npm test` must run once and exit in CI; `npm run test:coverage` reports coverage.
- Never call a real OpenAI API or use production customer data in automated tests.

## Deployment
- **dev:** laptop with Node.js >= 20.9 (Node 22 LTS recommended), `npm run dev`, local Supabase, `.env.local` (gitignored).
- **staging:** Vercel preview deployment and a separate non-production Supabase project; use test data.
- **prod:** Vercel production project on protected main branch and dedicated production Supabase project, with server-side OpenAI secret.
- CI required: install, lint, typecheck, test, build. Production deployment must follow passing checks; configure Vercel's Git deployment and GitHub branch protection (or a deliberately gated GitHub Actions deployment), avoiding duplicate deploy paths.
- Review SQL migrations and backups before deployment; verify anonymous and authenticated access in an incognito window, dashboard results, and AI requests.

## Agent Working Agreement
Read `spec.md` before implementation; modify only the smallest necessary files; include tests; report known limitations; never claim passing checks or deployment without actually running/verifying them.
