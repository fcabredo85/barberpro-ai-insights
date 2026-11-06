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
Real payment processing, automated subscription billing, SMS marketing, AI hairstyle generation, payroll disbursements, and full inventory management.

### 10. Deliverables
A functional deployed application, public GitHub repository, GitHub Actions workflow, three or more unit tests, README, short demonstration video, reflection report, and one proposed Version 2 improvement.
