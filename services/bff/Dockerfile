# syntax=docker/dockerfile:1
#
# Task 13.1 (local stack): builds the `services/bff` image, used for BOTH the
# `bff-api` and `bff-worker` docker-compose services (design: "one codebase,
# two processes"). `docker-compose.yml`'s `command:` selects which compiled
# entry point (`dist/main-api.js` vs `dist/main-worker.js`) each service runs.
#
# Build context MUST be the monorepo root, not this directory (see
# `docker-compose.yml`'s `build.context: .`) — pnpm's workspace resolution
# (`pnpm-workspace.yaml`: apps/*, services/*, packages/*) needs the whole
# workspace to link `contracts` into `services/bff` the same way a local
# `pnpm install` does.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /workspace
# Optional TLS-interception CA (corporate proxy / antivirus). Any *.crt placed
# in docker/certs/ (git-ignored) is trusted by Node via NODE_EXTRA_CA_CERTS.
# Empty by default, so a clean checkout builds exactly as before.
COPY docker/certs/ /tmp/extra-certs/
RUN cat /tmp/extra-certs/*.crt > /etc/extra-ca.pem 2>/dev/null || : > /etc/extra-ca.pem
ENV NODE_EXTRA_CA_CERTS=/etc/extra-ca.pem

# ---- deps: install the full workspace once, cached by Docker's layer cache
# keyed only on manifests/lockfile — a source-only change below does not
# invalidate this layer. ----
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY services/bff/package.json services/bff/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

# ---- build: compile `contracts` (bff's workspace dependency) then `bff`,
# then use pnpm's own `deploy` command (pnpm >= 8, pinned via this repo's
# `packageManager` field) to produce a self-contained, production-only
# directory for `bff` — workspace `workspace:*` dependencies resolved to
# their built content, dev dependencies excluded. ----
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY services/bff services/bff
RUN pnpm --filter contracts build
RUN pnpm --filter bff build
RUN pnpm --filter bff deploy --prod /deploy/bff

# ---- runtime: only the deployed, production-only package — no monorepo
# source, no devDependencies, no other workspace package's source. ----
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /deploy/bff ./

EXPOSE 3000
# Default to the `api` process; docker-compose.yml's `bff-worker` service
# overrides this with `["node", "dist/main-worker.js"]`.
CMD ["node", "dist/main-api.js"]
