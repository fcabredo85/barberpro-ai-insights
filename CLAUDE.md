# CLAUDE.md

## Project Overview
BarberPro AI Insights is a scoped AI-powered barbershop dashboard for owners to record service sales, compute commissions, and receive evidence-based business suggestions. It is a multi-tenant MVP for a Week 4 graded web application assignment, not a payment processor or complete commercial POS.

## Stack
- Frontend: Next.js 16 App Router (React 19), TypeScript strict, Tailwind CSS, optional shadcn/ui, Recharts
- Backend: Next.js Route Handlers and Server Actions, Zod
- Database: Supabase PostgreSQL with RLS and Supabase Auth
- AI/LLM: Vercel AI SDK + OpenAI, server-side only
- Deploy: Vercel, GitHub Actions
- Runtime: Node.js >= 20.9 (Node 22 LTS recommended)

## Commands
```bash
# From repository root, after package.json and scripts are scaffolded
npm ci
cp .env.example .env.local
npm run dev                # local Next.js app
npm run lint               # ESLint 9 flat config (eslint .)
npm run typecheck          # tsc --noEmit
npm test                   # Vitest unit tests (non-watch mode)
npm run build              # production bundle
npm run start              # serve built app locally

# Database (after Supabase CLI is configured; use local/staging only)
npx supabase start
npx supabase db reset      # DESTRUCTIVE: local database only
npx supabase migration new add_sales

# Deploy via connected Vercel project or guarded CI workflow;
# never run a production migration without review and a backup.
```
The Next.js app is scaffolded (Milestone 1); `dev`, `lint`, `typecheck`, `test`, `test:coverage` and `build` are working scripts. Supabase commands apply once the CLI and migrations are added.

## Architecture
- `/app` — Next.js App Router routes, layouts, authenticated pages
- `/app/api` — protected Next.js API route handlers
- `/components` — reusable dashboard, POS form and analytics UI
- `/lib/auth` — Supabase server auth and membership checks
- `/lib/db` — tenant-scoped queries and repositories
- `/lib/business` — exact-money sales and commission logic
- `/lib/ai` — server-side AI prompt, metrics preparation and output validation
- `/lib/validation` — Zod schemas
- `/supabase/migrations` — reviewed SQL schema, indexes, policies
- `/tests` — Vitest business/AI tests and integration tests
- `/.github/workflows` — CI pipeline

## Key Constraints
1. Deny access unless authenticated membership and database RLS authorize the requested barbershop.
2. Never put a Supabase service-role key or an OpenAI API key in client code, git, or logs.
3. Never process real payments in this assignment; record external cash or GCash payment methods only.
4. Derive price and commission rate from authorized server-side catalog records and snapshot them at sale time.
5. Perform deterministic monetary calculations in integer centavos or a tested decimal library, with transactional and idempotent sale creation.
6. Send only tenant-scoped aggregates to AI; validate structured model output and do not grant unrestricted SQL access.

## Coding Conventions
1. Use TypeScript strict mode; avoid `any` and validate external input with Zod.
2. Use PascalCase React components, camelCase TypeScript variables/functions, and snake_case SQL columns.
3. Keep UI components focused, moving domain calculations into `/lib/business` and database calls into `/lib/db`.
4. Add tests for new business logic, authorization boundaries, and AI output parsing.
5. Return structured API errors with safe messages and appropriate HTTP status codes.
