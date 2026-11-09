# Database: migrations and local setup

Schema, constraints, RLS policies and the workspace function live in
`supabase/migrations/`. They're applied in filename order:

| File | Contents |
|---|---|
| `20261106010000_core_schema.sql` | Enums, the five tenant tables, foreign keys (including same-shop composite keys on `sales`), check constraints, the unique `(barbershop_id, request_key)` key, indexes, `updated_at` triggers |
| `20261106010100_rls_and_workspace.sql` | Column-level privileges, RLS on every table, `is_member` / `is_owner` helpers, the `created_by` trigger, and the `create_barbershop()` function |
| `20261106020000_sales_report.sql` | `sales_report()`: tenant-scoped dashboard aggregates (exact sums, Asia/Manila days), runs with the caller's RLS |
| `20261106030000_ai_rate_limit.sql` | AI insight request log and `consume_ai_insight_quota()`: 2 per user per minute, 10 per barbershop per hour |
| `20261108010000_tryon_consent_and_ai_jobs.sql` | Virtual Try-On: `photo_consents`, `ai_generation_jobs`, `start_ai_job()` (consent + quota + idempotency gate before any AI call), `finish_ai_job()` |
| `20261108020000_saved_looks_storage.sql` | Save Look: private `images` storage bucket and policies (shop members only), `saved_looks`, `create_saved_look()`, `delete_saved_look()` |
| `20261108030000_appointments.sql` | Booking: `services.duration_minutes` (30/45/60), `appointments` with a no-overlap exclusion constraint (`btree_gist`), `booking_window()` (10:00–21:00 Asia/Manila), `appointment_slots()`, `book_appointment()`, `set_appointment_status()` (completing records the sale atomically) |

Prerequisites: Docker running, and `npm ci` done. Local Storage is enabled in
`config.toml` (needed for the private `images` bucket). The Supabase CLI is a dev
dependency, so use `npx supabase …`.

## Local development

```bash
npx supabase start              # first run pulls images; applies all migrations
npx supabase status             # shows API URL and anon key for .env.local
npm run db:types                # regenerate lib/db/database.types.ts after schema changes
npm run test:integration        # auth + tenant-isolation tests against the local DB
npx supabase stop               # stop containers (data is kept)
```

Put the local API URL and anon key in `.env.local`, as shown in `.env.example`.
Local email confirmation is off, so sign-up signs you in right away. Emails
that would be sent appear in Mailpit at http://127.0.0.1:54324.

To rebuild the local database from scratch (this wipes **local** data only):

```bash
npx supabase db reset
```

## Making a schema change

```bash
npx supabase migration new describe_change   # creates a timestamped file
# edit the file, then:
npx supabase db reset                         # re-apply everything locally
npm run db:types && npm run typecheck && npm run test:integration
```

Never edit a migration that has already been applied to a hosted project.
Add a new one instead.

## Applying to a hosted Supabase project (staging / production)

1. Review the SQL and **take a backup** (Dashboard → Database → Backups) before
   touching production.
2. Link and preview:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push --dry-run    # lists migrations that would be applied
   ```
3. Apply: `npx supabase db push`
4. In the Dashboard → Authentication settings, match the local config:
   - **Site URL**: your deployed URL, e.g. `https://<app>.vercel.app`
   - **Redirect URLs**: add `https://<app>.vercel.app/auth/callback`
     (and `http://localhost:3000/auth/callback` for local use against this project)
   - **Minimum password length**: 8
   - **Confirm email**: on for production. Sign-up then shows "check your email",
     and the link finishes at `/auth/callback`.
5. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel.
   The app never needs the service-role key, so don't add it to Vercel or `.env.local`.

Prefer a separate staging project for previews and tests. Integration tests
refuse to run against a non-local host unless `ALLOW_REMOTE_TEST_DB=true`.

## Security model

- **Deny by default.** `anon` has no table privileges. `authenticated` gets
  only the columns it needs. For example, `sales.occurred_at` and
  `sales.created_by` are server-set and can't be written by clients.
- **RLS** on every table: rows are visible only to members of their
  barbershop. Catalog writes are owner-only. Sales are insert-only (no update
  or delete).
- **Workspace creation** goes only through `create_barbershop(name)`. It runs
  as one transaction, takes the owner from the verified JWT (`auth.uid()`), and
  inserts the barbershop and the owner membership together.
- **Catalog snapshots are enforced.** The sales insert policy requires
  `unit_price` and `commission_rate` to equal the shop's current **active**
  service price and barber rate, so a client can't invent prices, even by
  calling the database API directly.
- **Same-shop composite foreign keys** stop a sale from referencing another
  shop's barber or service, a second line of defense behind RLS.
- **Arithmetic checks** enforce `gross_total = unit_price × quantity` and
  `commission_amount = round(gross_total × commission_rate, 2)` in the database.
