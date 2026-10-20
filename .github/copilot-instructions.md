# Tree of Books — Project Guidelines

## Stack

- **Next.js (App Router) + TypeScript**, strict mode on
- **Postgres** accessed through **Prisma**
- Server Components by default; `"use client"` only when a component needs state, effects or browser APIs
- Data mutations go through Server Actions or Route Handlers — never call Prisma from a client component

## Folder Layout

| Path | Contents |
|------|----------|
| `src/app/**` | Routes, layouts, pages, route handlers |
| `src/components/**` | Reusable UI components |
| `src/lib/**` | Shared utilities, the Prisma client singleton |
| `src/server/**` | Server-only domain logic, data access, Server Actions |
| `prisma/schema.prisma` | Data model and migrations |
| `tests/**` | Vitest unit tests and Playwright end-to-end tests |
| `docs/specs/**` | Feature specs written by the architect |
| `docs/bugs/**` | Bug reports written by the tester |

## Build and Test

```bash
npm install
npm run dev            # local dev server
npm run build          # production build, also type-checks
npm run lint
npm run typecheck      # tsc --noEmit
npm run test           # vitest
npm run test:e2e       # playwright
npx prisma migrate dev # apply schema changes locally
```

## Conventions

- No `any`. Prefer inferred types; add explicit types at module boundaries.
- Validate all external input (forms, route handler bodies, search params) with Zod before it reaches the domain layer.
- Never put secrets or `DATABASE_URL` in client-reachable code. Server-only env vars are read in `src/server/**` or `src/lib/env.ts` only.
- Database schema changes always ship as a Prisma migration — never edit the database by hand.
- Co-locate unit tests as `*.test.ts` next to the code; Playwright specs live in `tests/e2e/`.
- Commit messages: `type(scope): summary` (e.g. `feat(library): add shelf filtering`).

## Working as a Team of Agents

Three agents share this repo and hand work to each other through files, not conversation:

1. **architect** writes a spec to `docs/specs/<feature>.md`
2. **tester** writes failing tests from that spec
3. **implementer** makes the tests pass
4. **tester** verifies and files anything broken in `docs/bugs/<id>.md`

Always read the relevant spec before changing code, and keep the spec updated if the design changes.
