# Product Requirements Document (PRD)
## BarberPro AI — AI-Powered Barbershop Business Dashboard

**Project Type:** AI-Powered Web Application  
**Version:** 1.0 MVP  
**Target Market:** Philippine Barbershops

### 1. Product Overview
BarberPro AI is a web-based business management application that helps barbershop owners and managers record sales, calculate barber commissions, monitor business performance, and receive AI-generated recommendations. The application transforms daily transaction records into actionable insights that support better operational and financial decisions.

### 2. Problem Statement
Barbershop owners need an accessible and reliable way to track daily transactions, monitor employee performance, and understand business profitability. Manual recordkeeping and disconnected tools can make business analysis time-consuming and inconsistent.

### 3. Target Users
- **Primary:** Barbershop owners and managers.
- **Secondary:** Cashiers and barbers.
- **Future:** Multi-branch operators and franchise owners.

### 4. Core MVP Features
- **F1 — Authentication:** Authorized users can securely register and log in.
- **F2 — Barber and Service Management:** Owners can create barber profiles and configure service prices and commission rates.
- **F3 — Sales Recording:** Users can record completed services, assigned barbers, quantities, and payment methods without processing real payments.
- **F4 — Automated Commissions:** The application computes commission amounts based on configured rates.
- **F5 — Business Dashboard:** Displays total sales, transaction counts, commissions, average transaction value, and sales trends.
- **F6 — AI Business Insights:** Uses an AI model to analyze authorized, aggregated business records and generate practical recommendations supported by actual data.

### 5. AI Functionality
The AI Business Insights module will accept summarized sales and barber-performance data and generate observations, identify trends, and suggest operational improvements. AI recommendations must reference actual available figures, distinguish facts from suggestions, and avoid inventing financial information.

### 6. Technology Stack
- **Frontend:** Next.js 16 (React 19), TypeScript, Tailwind CSS, shadcn/ui
- **Backend:** Next.js Route Handlers and Server Actions
- **Database:** Supabase PostgreSQL
- **Authentication:** Supabase Auth
- **AI:** Vercel AI SDK with OpenAI
- **Visualization:** Recharts
- **Hosting:** Vercel
- **CI/CD:** GitHub Actions

### 7. Success and Acceptance Criteria
1. Authorized users can log in and manage their own records.
2. Sales transactions persist correctly in Supabase.
3. Commission calculations match expected results.
4. Dashboard metrics accurately reflect recorded transactions.
5. AI analysis provides at least three data-grounded observations or recommendations when sufficient information exists.
6. At least three automated unit tests pass.
7. The interface works on desktop and mobile.
8. The application is deployed to a working public URL, with secure authentication protecting business data.

### 8. Non-Functional Requirements
Enforce input validation, Supabase Row Level Security, environment-based secrets, responsive layouts, and appropriate error handling. Prevent AI access to other businesses' records and do not expose confidential API keys.

### 9. Out of Scope for MVP
Real payment processing, automated subscription billing, SMS marketing, payroll disbursements, and full inventory management. (AI hairstyle previews were originally out of scope; they were added in the Version 2 increment, section 11.)

### 10. Deliverables
A functional deployed application, public GitHub repository, GitHub Actions workflow, three or more unit tests, README, short demonstration video, reflection report, and one proposed Version 2 improvement.

### 11. Version 2 Increment: Virtual Try-On Studio and Appointments
Added after the core MVP shipped. Detailed requirement status, quotas and risks: `docs/virtual-try-on.md`.

**Problem:** Customers find it hard to picture a new haircut, and shops lose bookings between the consultation and the chair.

**Features**
- **F7 — Virtual Try-On Studio:** Staff upload a customer photo or take one with the device camera, record the customer's consent, choose one of six styles (Low Taper Fade, Textured Crop, Pompadour, Buzz Cut, Side Part, Crew Cut), and receive an AI-edited preview with a before/after comparison.
- **F8 — AI Hairstyle Advisor:** Recommends styles from four questions (length, styling effort, hair texture, desired look) without using the photo.
- **F9 — Saved Looks:** With separate storage consent, a preview is saved to private, shop-only storage and deleted after 90 days.
- **F10 — Appointments:** Book a barber and service (30, 45 or 60 minutes) between 10:00 and 21:00 Asia/Manila. Completing an appointment records the sale.

**Acceptance criteria**
1. Generate stays disabled until a valid JPG, PNG or WebP photo (8 MB or less) is chosen and the consent box is ticked; changing the photo clears consent.
2. No photo is sent to OpenAI unless the server has recorded consent and the user is within quota (10 previews per user per day, 60 per shop per day).
3. Previews come from a real image-edit call and are labelled as AI simulations; when the AI is unavailable, a clear message is shown and nothing is sent or saved.
4. Saved looks and their images are visible only to members of the same barbershop.
5. Two bookings can never overlap for the same barber, including bookings submitted at the same moment; the losing request is told the slot was taken.
6. Bookings outside 10:00–21:00, off the 15-minute grid, in the past, or more than 60 days ahead are rejected with a reason.
7. Completing an appointment records exactly one sale using the catalog price and commission rate.
