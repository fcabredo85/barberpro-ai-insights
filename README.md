# BarberPro AI Insights

An AI-powered dashboard for Philippine barbershops. Owners record service sales, get barber commissions calculated automatically, track performance, and get AI recommendations grounded in their own numbers. The app also includes a Virtual Try-On Studio that previews hairstyles on a customer's photo and books the appointment.

- **Live app:** https://barberpro-ai-insights.vercel.app
- **Video demo:** https://www.youtube.com/watch?v=O09A3tVaueE
- **Repository:** https://github.com/fcabredo85/barberpro-ai-insights
- **CI:** [GitHub Actions](https://github.com/fcabredo85/barberpro-ai-insights/actions) runs lint, typecheck, unit tests, build and integration tests on every pull request and push to `main`

> This is a graded MVP (Week 4 assignment), not a commercial POS. It **records** payments made in cash or GCash; it never processes real payments.

## Features

| Feature | What it does |
|---|---|
| **Accounts and workspaces** | Sign up and log in with Supabase Auth, then create a barbershop. Every record belongs to one barbershop, and other users can't see it. |
| **Catalog** | Manage barbers (commission rate) and services (price in pesos, 30/45/60-minute duration). |
| **Sales recording** | Record a service sale with barber, quantity and payment method. The server sets the price and commission from the catalog, calculates in integer centavos, and saves each sale exactly once, even if the form is submitted twice. |
| **Dashboard** | Today's and recent sales, transaction count, revenue, commissions, average sale, trend chart, and breakdowns by barber and service (Asia/Manila time). |
| **AI Business Insights** | Three recommendations, each with an observation, the supporting numbers and a suggested action. They're generated only from your shop's aggregated figures. |
| **Virtual Try-On Studio** | Upload a photo or take one with the camera, give consent, choose one of six styles, and get an AI-edited preview with a before/after slider. |
| **AI Hairstyle Advisor** | Recommends styles from four quick questions. It never uses the photo. |
| **Saved looks** | Save a preview with the customer's consent to a private, shop-only storage bucket. Saved looks are deleted after 90 days. |
| **Appointments** | Book a barber for 10:00–21:00 (Asia/Manila). The database prevents double bookings. Completing an appointment records the sale automatically. |

## Tech stack

Next.js 16 (App Router, React 19) · TypeScript (strict) · Tailwind CSS · shadcn/ui · Recharts · Zod · Supabase (PostgreSQL, Auth, Storage, Row Level Security) · Vercel AI SDK + OpenAI · Vitest · GitHub Actions · Vercel

## Architecture

```
Browser (Next.js pages)
   │  HTTPS, Supabase session cookie
   ▼
Next.js route handlers / server actions on Vercel  ── Zod validation, membership check
   │                                   │
   │ user's own session (RLS applies)  │ server-only API key
   ▼                                   ▼
Supabase: Postgres + Auth + Storage    OpenAI: text model (insights, advisor)
  • RLS on every table                         image model (try-on edits)
  • money, quotas and bookings enforced
    in SQL functions
```

- **Tenant isolation:** every table has Row Level Security. The app uses the signed-in user's session and **never** a service-role key, so the database itself refuses cross-shop access.
- **Money:** amounts are integer centavos. Price and commission rate are copied from the catalog when the sale is saved, so later price changes don't rewrite history.
- **AI trust boundary:** the server computes aggregates and sends only those to OpenAI. The model has no database access, and its output is validated with Zod before it's shown.
- **Try-on gate:** `start_ai_job()` checks membership, consent, quotas and duplicate requests in Postgres **before** a photo is sent to OpenAI.

More detail: [architecture.md](architecture.md) · [spec.md](spec.md) · [PRD.md](PRD.md) · [docs/virtual-try-on.md](docs/virtual-try-on.md)

### Project layout

| Path | Contents |
|---|---|
| `app/` | Pages (`/dashboard`, `/sales`, `/studio`, `/appointments`, `/settings`, …) and API route handlers in `app/api/` |
| `components/` | Dashboard, sales form, studio and booking UI |
| `lib/business/` | Exact-money sales and commission logic |
| `lib/ai/`, `lib/tryon/`, `lib/advisor/` | Prompts, metric preparation, output validation, image handling |
| `lib/db/` | Tenant-scoped database queries |
| `lib/validation/` | Zod schemas |
| `supabase/migrations/` | Schema, RLS policies and SQL functions ([supabase/README.md](supabase/README.md)) |
| `tests/unit/`, `tests/integration/` | Vitest tests |
| `.github/workflows/ci.yml` | CI pipeline |

## Running locally

Requirements: Node.js 22 LTS (≥ 20.9) and Docker (for local Supabase).

```bash
npm ci
cp .env.example .env.local

npx supabase start          # local Postgres/Auth/Storage; applies all migrations
npx supabase status         # copy the API URL and anon key into .env.local

npm run dev                 # http://localhost:3000
```

Local email confirmation is off, so signing up logs you in right away. To fill the dashboard with sample data, see [scripts/demo/seed-demo-sales.sql](scripts/demo/seed-demo-sales.sql).

### Environment variables

| Name | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | Supabase anon/publishable key (all access is still enforced by RLS) |
| `NEXT_PUBLIC_SITE_URL` | optional | Canonical URL for auth email links |
| `OPENAI_API_KEY` | **server only** | AI insights, try-on and advisor |
| `OPENAI_MODEL` | optional, server | Text model (default `gpt-5.4-mini`) |
| `OPENAI_IMAGE_MODEL` | server | Image-edit model for try-on, e.g. `gpt-image-2.5-flare`. Previews are off if unset. |

Secrets live in `.env.local` (gitignored) and in Vercel project settings. No Supabase service-role key is used anywhere.

## Tests and CI

```bash
npm run lint                # ESLint 9
npm run typecheck           # tsc --noEmit
npm test                    # unit tests (Vitest)
npm run test:integration    # needs local Supabase running
npm run build
```

- **Unit tests:** commission and rounding rules, metrics, AI prompt and output validation, image validation, API routes (auth, validation, error mapping) and UI components.
- **Integration tests:** run against a real local Supabase. They cover sign-up and workspaces, **cross-tenant isolation**, sales idempotency, AI quotas, try-on jobs, saved looks, and booking rules, including simultaneous bookings for the same slot.
- **CI** ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs both suites on every PR and push to `main`; the integration job starts a throwaway Supabase. Vercel deploys `main` to production and each PR to a preview URL.

## Deployment

- **Hosting:** Vercel, connected to this repository. Merging to `main` deploys to production.
- **Database:** hosted Supabase. Migrations are applied with `npx supabase db push --remote` after review and a backup (see [supabase/README.md](supabase/README.md)).

## AI limitations

- Insights are **advisory**. They're generated from your shop's aggregated totals, and the model can still misread trends. With too little data, the app says so instead of inventing figures.
- Try-on previews are **AI simulations**; the real haircut may look different. A photo is sent to OpenAI only after explicit consent, and it isn't stored unless a look is saved with separate consent.
- Fixed quotas cap cost and abuse. Insights: 2 per user per minute, 10 per shop per hour. Try-on: 10 per user per day, 60 per shop per day. Advisor: 30 per user per day.
- If OpenAI is unavailable or not configured, AI panels show a clear message and the rest of the app keeps working.

## Project documents

| Document | Purpose |
|---|---|
| [PRD.md](PRD.md) | Product requirements and acceptance criteria |
| [spec.md](spec.md) | Implementation spec: user stories, acceptance criteria, routes, test plan |
| [architecture.md](architecture.md) | System design, data model, RLS and AI data flow |
| [docs/virtual-try-on.md](docs/virtual-try-on.md) | Try-On Studio, Advisor and booking: requirement status, quotas, risks |
| [docs/test-report.md](docs/test-report.md), [PHASE3-REPORT.md](PHASE3-REPORT.md) | Test and acceptance evidence |
| [CLAUDE.md](CLAUDE.md), [agents.md](agents.md), [.cursorrules](.cursorrules) | Instructions for AI coding agents |
| [spec-review.md](spec-review.md) | Spec review findings and decisions |
