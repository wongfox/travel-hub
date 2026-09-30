# Travel Hub

Inca Rail passenger companion — a link-based (no accounts, no passwords) web/PWA
travel hub for booked passengers: trip status, itinerary, boarding pass, travel
documents, offline access, pre check-in, onboard WiFi checkout, push
notifications, and more. See `docs/travel-hub-v2.md` for the full product
source document.

## Monorepo layout

This is a TypeScript monorepo managed with [pnpm workspaces](https://pnpm.io/workspaces)
and [Turborepo](https://turbo.build/repo).

```text
apps/
  web/            Vite + React PWA (the passenger-facing app)
services/
  bff/            Node.js 22 + Fastify hexagonal BFF ("api" and "worker" processes)
packages/
  contracts/      Shared zod schemas + inferred TypeScript types (DTOs, error codes)
```

Additional top-level directories, added as later work units land:

- `e2e/` — Playwright end-to-end suite.
- `infra/` — infrastructure-as-code for the reference AWS deployment.
- `docs/` — product and design source documents.

## Prerequisites

- Node.js `22.11.0` or later (see `.nvmrc`; use `nvm use` or an equivalent).
- [pnpm](https://pnpm.io/) `9.x`, ideally via [Corepack](https://nodejs.org/api/corepack.html)
  (`corepack enable` — the pinned version is declared in `package.json`'s
  `packageManager` field).

## Local development

Install dependencies for every workspace package from the repo root:

```bash
pnpm install
```

Run the full pipeline (lint, typecheck, test, build) across every package via
Turborepo:

```bash
pnpm turbo run lint typecheck test build
```

Or run an individual task across the whole workspace:

```bash
pnpm build       # turbo run build
pnpm test        # turbo run test
pnpm lint        # turbo run lint
pnpm typecheck   # turbo run typecheck
```

Scope any of the above to a single package with `pnpm --filter <package-name> <script>`,
for example `pnpm --filter contracts test` or `pnpm --filter bff test`.

Once `services/bff` and its `docker-compose.yml` land (later work units), the
full local stack — web, BFF `api`/`worker` processes, Postgres, and stub
adapters for every external dependency — will start with:

```bash
docker-compose up
```

## Tooling

- **TypeScript**: strict mode, shared base config in `tsconfig.base.json`.
- **Linting**: ESLint flat config (`eslint.config.js`) with `typescript-eslint`,
  Prettier-compatible (no conflicting stylistic rules).
- **Formatting**: Prettier, configured in `.prettierrc`.
- **CI**: GitHub Actions (`.github/workflows/ci.yml`) runs
  `pnpm install --frozen-lockfile` followed by
  `pnpm turbo run lint typecheck test build` on every pull request.

## Status

This repository is under active build-out via a work-unit-by-work-unit delivery
plan (see the project's SDD tasks artifact for the full breakdown). This
foundation work unit adds only the monorepo scaffold and tooling; no
application packages exist yet.
