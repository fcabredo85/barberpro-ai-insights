# Reflection — BarberPro AI Insights

**Fernando Cabredo · Week 4 Graded Assignment · November 2026**
Live app: https://barberpro-ai-insights.vercel.app · Repo: https://github.com/fcabredo85/barberpro-ai-insights

## What I built

BarberPro AI Insights helps Philippine barbershop owners record service sales, calculate barber commissions, follow performance on a dashboard, and get AI recommendations grounded in their own numbers. After the MVP shipped I added a Version 2 increment: a Virtual Try-On Studio (upload or camera photo, AI-edited hairstyle preview), an AI Hairstyle Advisor, saved looks, appointment booking that records the sale on completion, and forgot-password reset plus change-password in Settings.

## What went well

**Spec first.** My first plan had twelve modules. Reviewing it before coding cut it to four (sales, commissions, dashboard, AI insights) and forced testable acceptance criteria. Those criteria became the tests, and the rules in `CLAUDE.md` (integer centavos, server-set prices, RLS on every table, no secrets in the browser) kept the AI coding agent consistent from the first feature to the last.

**Rules live in the database.** Tenant isolation, sale idempotency, AI quotas, photo consent and no double-booking are enforced by PostgreSQL constraints, RLS and SQL functions, not just the UI. A bug in a page can't leak another shop's data or turn one click into two sales.

**CI against a real database.** Integration tests run against a throwaway Supabase in GitHub Actions on every pull request. They caught a concurrency bug that unit tests and manual testing missed.

## What was hard, and what I learned

1. **Deployment is where assumptions break.** The hosted database had none of the new migrations, because I had first applied the schema by hand and its migration history was empty. I learned to repair the history, apply migrations only through the CLI, and dry-run and back up before touching production.
2. **Configuration failures look like code failures.** "AI previews aren't available" was one missing environment variable, first locally and then again in Vercel. Every environment needs the same checklist.
3. **Evidence beats guesses.** A booking test failed once in CI and then passed. My deadlock theory didn't reproduce locally, so instead of shipping a speculative fix I made the test report the Postgres error code. The next run showed `40P01` (deadlock) on 4 of 6 simultaneous bookings; a per-barber lock fixed it, and CI confirmed.
4. **Cost controls affect testing.** Failed preview attempts count toward the daily AI quota, so I hit the limit while debugging. That's correct for budget protection, but testers need a way to reset it.
5. **Working with an AI agent.** The agent was fast at scaffolding, tests and documentation. I kept the decisions that matter: scope, consent wording, the image model, and explicit approval for every production merge and migration.

## What I would do differently

- Create a **staging** Supabase project from day one, so migrations and live AI calls are tested before production.
- Run a full **new-user smoke test on the live URL** after every deploy, not just the automated checks.
- **Talk to real barbershop owners earlier.** I haven't validated the product with operators yet; the problem statement rests on my own understanding of the domain.

## Next step

[Per-barber working hours and days off](https://github.com/fcabredo85/barberpro-ai-insights/issues/5), so bookings only go to barbers who are actually working.
