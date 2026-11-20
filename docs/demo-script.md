# Two-Minute Demo Script — BarberPro AI Insights

**Target length:** 2:00 (about 270 spoken words) · **Record at:** https://barberpro-ai-insights.vercel.app

## Before you record

- Sign in as a demo owner whose shop has sample sales loaded with `scripts/demo/seed-demo-sales.sql`, so the dashboard and AI insights have data.
- Book one appointment that **starts within the next 30 minutes**. An appointment can only be completed from 30 minutes before it starts.
- Have a face photo ready to upload (yours, or one you have permission to use).
- Generate one AI insight and one try-on preview before recording, to check your keys and quota. Each live attempt uses up some of the daily quota.
- Use a 1440 px browser window, hide bookmarks and notifications, and zoom to 110% so text is readable.

## Script

| Time | On screen | Voice-over |
|---|---|---|
| 0:00–0:12 | Landing page, then sign in | "Barbershop owners in the Philippines often track sales and barber commissions in notebooks. BarberPro AI Insights turns each sale into accurate commissions, a live dashboard and AI suggestions based on the shop's own numbers." |
| 0:12–0:35 | **New sale**: choose a barber and service, set the quantity, choose Cash or GCash, click **Record sale**. The receipt opens. | "Recording a sale takes seconds. I pick the barber and service; the price and commission rate come from the server, not the browser, and are saved with the sale. The math uses whole centavos, so ₱250 at 40% is exactly ₱100. Payments are recorded only; the app never charges anyone. A double click can't create two sales." |
| 0:35–1:00 | **Dashboard**: point to gross sales, commissions, the revenue trend, and sales by barber and by service | "The dashboard shows gross sales, transactions, commissions and average ticket for the period in Manila time, with the revenue trend and breakdowns by barber and service. These totals match the sales history exactly; tests check that." |
| 1:00–1:20 | Click **Generate insights**, then read one card aloud | "Now the AI. Only aggregate totals are sent, never customer details or barber names. It returns three suggestions, each backed by a number from my data. The output is checked on the server; an answer with an invented figure is rejected." |
| 1:20–1:45 | **Studio**: upload a photo, agree to photo processing, choose a style such as Low Taper Fade, click **Generate AI Preview**, then **Save Look** | "In Version 2, customers can preview a cut before they sit down. They agree to photo processing, choose a style and get an AI-edited preview, which they can save or book." |
| 1:45–1:55 | **Appointments**: complete the appointment you booked earlier, then show the new sale in Sales history | "When the appointment is completed, the sale is recorded automatically, with the commission included." |
| 1:55–2:00 | Back to the dashboard | "Every shop's data is isolated by database security rules and tested in CI. That's BarberPro AI Insights." |

## Tips

- Practice the script out loud once. If you're over time, shorten the dashboard section first.
- Don't show `.env` files, the Supabase dashboard or the Vercel settings on screen.
- If a live AI call fails during recording, cut to the result you generated before recording rather than retrying again and again; each retry uses quota.
