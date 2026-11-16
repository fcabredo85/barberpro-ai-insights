# Specification Review — BarberPro AI Insights

**Status:** Reviewed; implemented and deployed at https://barberpro-ai-insights.vercel.app (updated 2026-11-16). Remaining items are listed below.

## Review checklist
| Area | Review finding | Resolution in spec v1.1 |
| --- | --- | --- |
| Scope | Full BarberPro AI SaaS is too large for graded mini-project | Cut to POS-style sale entry, commissions, metrics and AI recommendations |
| Domain AI | Generic chatbot would not satisfy assignment | Require evidence-based actionable insights from computed business metrics |
| Payment risk | Brief says avoid real payment processing | Record payment method only; no payment gateway or charge initiation |
| Security | User-provided tenant ID can leak data | Supabase membership checks and RLS on tenant-owned tables |
| Accuracy | Changing catalog prices can rewrite past reports | Snapshot price and rate on each sale; deterministic exact-money arithmetic |
| Reliability | Duplicate submission could double sales | Unique request key and atomic insert |
| Testing | At least 3 unit tests required | Concrete cases plus auth/RLS integration checks |
| Delivery | Real build-and-ship outputs required | CI, public repo, live URL, env vars, monitoring, README, demo and reflection listed |
| Deployment | Ambiguous ownership of production deploy | Vercel Git integration after required checks, or one gated Actions path, not both |
| Dependencies | Next.js 14.2.33 (final 14.x) has unpatched critical/high advisories | Upgraded to Next.js 16.4.5 + React 19 (spec decision 7, 2026-11-06); `npm audit` clean |

## Remaining validation tasks
- Interview actual barbershop operators and record anonymized evidence; do not claim this has happened. **Still pending.**
- ~~Generate real repo with five meaningful commits and implement all screens.~~ Done (15+ commits, 3+ merged PRs).
- ~~Run tests/CI and capture outputs; confirm RLS with two different user accounts.~~ Done: CI runs unit and integration tests, including cross-tenant isolation, on every PR.
- Deploy and verify the public URL in incognito: deployed; **a full new-user pass on the live URL is still to be recorded.** Record the demo: **pending.** Personal reflection: drafted in `docs/reflection.md`.

## Assignment compliance crosswalk
- **Phase 1:** seven-step validation and one-page PRD (`PRD.md`); primary user research pending.
- **Phase 2:** architecture.md, spec.md, CLAUDE.md, agents.md, .cursorrules, this documented review.
- **Phase 3:** done. Scaffold, AI insights, sales and commissions, dashboard; unit and integration tests; secret and input reviews (`PHASE3-REPORT.md`).
- **Phase 4:** done. GitHub Actions (`.github/workflows/ci.yml`), Vercel production deploy from `main`, environment variables in Vercel, migrations applied to hosted Supabase.
- **Phase 5:** README rewritten; reflection in `docs/reflection.md`; Version 2 issue [#5](https://github.com/fcabredo85/barberpro-ai-insights/issues/5). Two-minute demo **pending**.
