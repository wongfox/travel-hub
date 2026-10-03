# syntax=docker/dockerfile:1
#
# Task 13.1 (local stack): builds the static `apps/web` bundle and serves it
# via nginx as a local CDN-equivalent (design Decision 3: "CloudFront, static
# web from S3" in the real deployment; `docker/nginx.conf` reproduces the
# same same-origin `/api/*` routing locally, see that file's own comments).
#
# Build context MUST be the monorepo root (see `docker-compose.yml`'s
# `build.context: .`), same reason as `services/bff/Dockerfile`.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /workspace
# Optional TLS-interception CA (corporate proxy / antivirus). Any *.crt placed
# in docker/certs/ (git-ignored) is trusted by Node via NODE_EXTRA_CA_CERTS.
# Empty by default, so a clean checkout builds exactly as before.
COPY docker/certs/ /tmp/extra-certs/
RUN cat /tmp/extra-certs/*.crt > /etc/extra-ca.pem 2>/dev/null || : > /etc/extra-ca.pem
ENV NODE_EXTRA_CA_CERTS=/etc/extra-ca.pem

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY services/bff/package.json services/bff/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/web apps/web
RUN pnpm --filter contracts build
# `apps/web`'s own `build` script runs `tsc --noEmit` before `vite build`
# (package.json); no separate typecheck step needed here.
RUN pnpm --filter web build

FROM nginx:1.27-alpine AS runtime
COPY apps/web/docker/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html

EXPOSE 80
