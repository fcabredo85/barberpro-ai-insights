# Specification Review — BarberPro AI Insights

**Status:** Draft reviewed for assignment completeness; implementation and validation are still outstanding.

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
- Interview actual barbershop operators and record anonymized evidence; do not claim this has happened.
- Generate real repo with five meaningful commits and implement all screens.
- Run tests/CI and capture outputs; confirm RLS with two different user accounts.
- Deploy and verify the public URL in incognito; record demo and write personal reflection.

## Assignment compliance crosswalk
- **Phase 1:** seven-step validation and one-page PRD drafted in chat; primary user research pending.
- **Phase 2:** architecture.md, spec.md, CLAUDE.md, agents.md, .cursorrules, this documented review.
- **Phase 3:** scaffold, AI implementation, five commits, three unit tests, secret/input reviews — not yet built.
- **Phase 4:** GitHub Actions, live host, env configuration, live tests, monitoring — not yet completed.
- **Phase 5:** README, two-minute demonstration, one-page reflection, version 2 issue — not yet completed.
