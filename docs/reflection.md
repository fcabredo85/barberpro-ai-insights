# Reflection — BarberPro AI Insights

**Fernando Cabredo · Week 4 Graded Assignment · November 2026**
Live app: https://barberpro-ai-insights.vercel.app · Repo: https://github.com/fcabredo85/barberpro-ai-insights

## What I built

BarberPro AI Insights helps Philippine barbershop owners record service sales, calculate barber commissions, follow performance on a dashboard, and get AI recommendations grounded in their own numbers. After the core MVP shipped, I added a Version 2 increment: a Virtual Try-On Studio (photo upload or camera, AI-edited hairstyle preview), an AI Hairstyle Advisor, saved looks, and appointment booking that records the sale when the appointment is completed.

## What went well

**Writing the spec first paid off.** My first plan had twelve modules. Reviewing it before writing code cut that to four (sales, commissions, dashboard, AI insights) and made me write testable acceptance criteria. Those criteria became the tests, and the rules in `CLAUDE.md` and `.cursorrules` (integer centavos, server-set prices, RLS on every table, no secrets in the browser) kept the AI coding agent consistent from the first feature to the last.

**Putting the important rules in the database.** Tenant isolation, sale idempotency, AI quotas, photo consent and the no-double-booking rule are enforced by PostgreSQL constraints, RLS and SQL functions, not only by the UI. A bug in a page can't leak another shop's data or create two sales from one click.

**CI that tests against a real database.** Integration tests run against a throwaway Supabase in GitHub Actions on every pull request. They caught a real concurrency bug (below) that unit tests and manual testing missed.

## What was hard, and what I learned

1. **Deployment is where assumptions break.** The app worked locally, but the hosted database had none of the new migrations. Its migration history was empty because I had first applied the schema by hand. I learned to repair the history, apply migrations only through the CLI, and always run a dry run and take a backup before touching production.
2. **Configuration failures look like code failures.** "AI previews aren't available" turned out to be one missing environment variable, first locally and then again in Vercel. Every environment needs the same checklist.
3. **Evidence beats guesses.** One booking test failed once in CI and then passed. My first theory (a database deadlock) didn't hold up in a local experiment, so instead of shipping a speculative fix, I made the test report the exact Postgres error code. The next CI run showed `40P01` (deadlock) on 4 of 6 simultaneous bookings. I fixed it with a per-barber lock and CI confirmed it. The diagnostics were worth more than the first fix.
4. **Quotas protect the budget, but they also affect testing.** Failed preview attempts counted toward the daily limit, so I hit the limit while debugging. That's the intended behaviour for cost control, but it means testers need a way to reset it.
5. **Working with an AI agent.** The agent was fast at scaffolding, tests and documentation, but I kept the decisions that matter: scope, the consent wording, the image model, and every production merge and database migration needed my explicit approval.

## What I would do differently

- Create a **staging** Supabase project from day one, so migrations and live AI calls are tested before production.
- Run a full **new-user smoke test on the live URL** after every deploy, not just the automated checks.
- Talk to real barbershop owners earlier. I haven't yet validated the product with operators; the problem statement is based on my own understanding of the domain.

## Next step

Version 2 proposal: [per-barber working hours and days off](https://github.com/fcabredo85/barberpro-ai-insights/issues/5), so bookings only go to barbers who are actually working.
