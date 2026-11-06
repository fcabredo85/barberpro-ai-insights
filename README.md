# BarberPro AI Insights — Phase 2 Assignment Deliverables

This folder contains **design/specification files**, not a runnable implementation, for Week 4 Graded Assignment 4.2.

## Contents
- `architecture.md` — stack, system design, data model, RLS, AI trust boundary and flow.
- `spec.md` — reviewed implementation specification and acceptance criteria.
- `CLAUDE.md` — coding-agent project instructions.
- `agents.md` — alternate agent instructions, testing, commands and deployments.
- `.cursorrules` — ten specific rules for Cursor.
- `spec-review.md` — decisions, review findings and assignment crosswalk.

## How to use
1. Read `spec.md` and `architecture.md`.
2. Create a new Next.js 16 TypeScript App Router project, with Tailwind and npm scripts specified in `agents.md`.
3. Copy `CLAUDE.md`, `agents.md`, and `.cursorrules` to the repository root; place the spec docs in `docs/` if desired.
4. Scaffold Supabase schema/Auth/RLS and the app modules in acceptance-criteria order.
5. Implement and verify tests/CI/deployment before recording submission evidence.

The uploaded assignment brief permits other stacks but recommends Next.js 14, Vercel AI SDK, Supabase, and Vercel. This package follows those recommendations, except that it uses Next.js 16 rather than 14 after a dependency security review (see `spec.md` §11, decision 7).


## Product requirements
- `PRD.md` — one-page MVP Product Requirements Document carried forward from Phase 1.
