# Virtual Try-On Studio & AI Hairstyle Advisor — implementation status

Source of truth: `BarberPro-AI_Virtual_Try-On_PRD.md` (v1.0, 2026-11-08). This file maps PRD requirement IDs to code and tests.
Branch: `feat/virtual-try-on-studio`. Status as of 2026-11-08 (increment 3: appointment booking).

## Owner decisions (2026-11-08)

| Decision | Choice |
|---|---|
| Who is the customer | **Staff-run consultations.** Looks belong to the barbershop; the customer is a staff-entered name, not an account |
| Photo storage | **Private Supabase Storage bucket `images`**, paths `{barbershopId}/{lookId}/original\|preview.{ext}`, shop members only, 5-minute signed URLs |
| Booking | **Real appointment system (option A)**. Services take 30/45/60 min; bookings 10:00–21:00 Asia/Manila every day; completing an appointment records a sale |
| Limits | Keep current quotas; no budget alerts yet |
| Image model | `gpt-image-2.5-flare` (in `.env.example`; account access to be confirmed by the owner) |

## Status by requirement

| ID | Status | Where | Tests |
|---|---|---|---|
| FR-01 Responsive studio | Done (needs manual QA at 360/768/1440) | `app/(app)/studio`, `components/studio/*` | `virtual-studio.test.tsx` |
| FR-02 Default Low Taper Fade | Done | `lib/tryon/styles.ts` | `tryon-catalog-and-prompt`, `virtual-studio` |
| FR-03 Upload JPG/PNG/WebP ≤ 8 MB | Done | `lib/tryon/image-validation.ts`, `prepare-photo.ts` | `tryon-image-validation`, `api-try-on-route` |
| FR-04 Server image validation | Done (no full pixel decode on the server; see risks) | `image-validation.ts`, `app/api/try-on/route.ts` | same |
| FR-05 Consent, unchecked, reset, recorded | Done; separate storage consent for saving | `consent-panel.tsx`, `save-look-panel.tsx`, `start_ai_job()`, `create_saved_look()` | unit + integration |
| FR-06 Catalog of 6 styles with stable IDs | Partial: no reference images yet | `lib/tryon/styles.ts` | catalog test |
| FR-07 Real AI edit, never fabricated | Done | `lib/tryon/generate-preview.ts` | `tryon-generate-preview` |
| FR-08 Edit-fidelity prompt | Done | `lib/tryon/prompt.ts` | catalog/prompt test |
| FR-09 Progress, no duplicates, retry | Done | studio and `request_key` uniqueness | component and integration tests |
| FR-10 Accessible before/after | Done (needs manual screen-reader QA) | `before-after-compare.tsx` | component test |
| FR-11 Simulation disclaimer | Done | `lib/tryon/consent.ts` | route and component tests |
| FR-12 Auth for persistence | Done for the staff model: every save, list, and delete requires a shop member | `/api/looks*` | unit + integration |
| FR-13 Secure Save Look | Done | `lib/db/looks.ts`, `/api/looks`, `/studio/looks` | `api-looks-route`, `saved-looks` integration |
| FR-14 Save-and-Book handoff | Done: "Book this style" from a saved look or the studio; server-computed availability; no double booking enforced in the database; "Confirmed" shown only after the row exists; completing records the sale | `/appointments`, `/appointments/new`, `/api/appointments*`, migration 3 | `api-appointments-route`, `booking-form`, `appointments` integration |
| FR-15 Privacy management / deletion | Partial: delete removes photos + record and revokes storage consent; 90-day retention purge runs when looks are listed. No consent-history screen; no scheduled purge | `DELETE /api/looks/:id`, `purgeExpiredLooks` | unit + integration |
| FR-16 RLS / access | Done for new tables and the bucket (verified against local Supabase) | migrations | `tryon-jobs`, `saved-looks` integration |
| FR-17 Cost and abuse controls | Partial: per-user/minute, per-user/day, per-shop/day, 1 in-flight job, idempotency. **No budget alerts or monitoring** | `start_ai_job()` | integration test |
| FR-18 Graceful AI unavailable | Done | route `failureResponse` | route test |
| FR-19 AI Hairstyle Advisor (P1) | Done (preferences only; no photo) | `lib/advisor/*`, `/api/hairstyle-advice` | `advisor`, `api-hairstyle-advice-route` |
| FR-20–24 | Not started | — | — |

## Quotas (fixed in `start_ai_job()`)

| Feature | Per user per minute | Per user per day | Per shop per day |
|---|---|---|---|
| Try-on preview | 2 | 10 | 60 |
| Advisor | 3 | 30 | 200 |

Each user can have only one in-flight job at a time. The SDK makes no automatic retries for image edits, so every billed call is an explicit user action.

## Before deploying

1. Apply all three migrations (`20261108010000`, `20261108020000`, `20261108030000`) to a **staging** project and run `npm run test:integration` there. `.env.local` currently points at the hosted project, where they are **not** applied, so `/studio` generation, `/studio/looks` and `/appointments` fail until they are. Migration 3 adds a column (default 30) to the existing `services` table and enables the `btree_gist` extension. Applying them to production needs explicit approval.
2. Confirm `gpt-image-2.5-flare` works for image edits on your OpenAI account, and add `OPENAI_IMAGE_MODEL` to `.env.local` and Vercel.
3. Confirm your Vercel plan allows `maxDuration = 120` for `/api/try-on`. The save request (original plus preview, about 3 MB) must stay under Vercel's ~4.5 MB body limit.
4. Get legal review of both consent notices and the 90-day retention period (`lib/tryon/consent.ts`; versions marked draft).
5. Do manual QA at 360/768/1440 px with keyboard and a screen reader.

## Remaining open decisions

1. Retention period (90 days is a draft) and whether a scheduled purge is needed. A purge that runs without a user needs a server-side scheduler, plus a service-role key or `pg_cron` with a Storage API call.
2. Budget alerting channel (quotas exist; alerts don't).
3. Booking: should some days be closed? Should barbers have their own hours? Should customers get reminders? Today every active barber is bookable 10:00–21:00 every day.

## Known risks

- The server parses image headers and structure but does not fully decode pixels.
- A saved "preview" is the image the browser sends back. The server checks that it is a valid image and that the job succeeded with that style, but it cannot prove the bytes are the model's output. Storing the preview server-side at generation time would close this gap.
- Expired looks are purged only when someone opens Saved Looks or calls `GET /api/looks`.
- Deleting a whole barbershop removes its look records but not its stored files (there's no shop-deletion feature today).
- Completing an appointment records the sale at the price and commission rate **at completion time**, matching `/sales/new`. If the price changed after booking, the sale uses the new price.
- The complete-and-record-sale path was verified by a SQL check against the local database (rolled back). It is not in CI, because the API can't create an appointment that has already started. A pgTAP test (`supabase test db`) would automate it.
- Deactivating a barber or service doesn't cancel their future appointments. Completing those is refused with a clear message until the barber or service is reactivated.
