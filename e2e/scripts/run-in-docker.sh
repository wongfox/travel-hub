#!/usr/bin/env bash
# Runs the Playwright suite inside the official Playwright image against the
# IN-PROCESS BFF harness (e2e/harness). Everything the run needs is packaged
# from the host build output, so the container needs NO network at runtime
# (never run npm/pnpm inside it).
#
# Usage:   e2e/scripts/run-in-docker.sh [playwright test args...]
# Default: --project=chromium --reporter=list
#
# Env:
#   DOCKER            docker CLI (default: docker; on WSL with Docker Desktop use
#                     "/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe")
#   E2E_IMAGE         image tag to build/run (default: travelhub-e2e)
#   E2E_DOCKER_CTX    build-context dir (default: e2e/.docker-ctx, git-ignored)
#   SKIP_BUILD=1      skip `turbo build` of bff/contracts/web (reuse dist/)
#   SKIP_DEPLOY=1     reuse the previously assembled bff deploy dir in the context
set -euo pipefail

REPO="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
DOCKER="${DOCKER:-docker}"
IMAGE="${E2E_IMAGE:-travelhub-e2e}"
CTX="${E2E_DOCKER_CTX:-$REPO/e2e/.docker-ctx}"
PLAYWRIGHT_VERSION="$(node -p "require('$REPO/e2e/node_modules/@playwright/test/package.json').version")"
BASE_IMAGE="mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble"

cd "$REPO"

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  pnpm -w exec turbo run build --filter=bff --filter=contracts --filter=web
fi
for required in services/bff/dist/composition-root.js packages/contracts/dist/index.js apps/web/dist/index.html; do
  [[ -f "$required" ]] || { echo "missing build output: $required" >&2; exit 1; }
done

mkdir -p "$CTX"
# 1. e2e sources (no node_modules / results / the context itself).
rm -rf "$CTX/work/e2e-src" "$CTX/work/e2e"
mkdir -p "$CTX/work/e2e"
tar -C e2e --exclude=node_modules --exclude=test-results --exclude=playwright-report \
  --exclude=.docker-ctx -cf - . | tar -C "$CTX/work/e2e" -xf -

# 2. Playwright runtime deps, dereferenced out of the pnpm virtual store
#    (@playwright/test, playwright, playwright-core).
rm -rf "$CTX/work/e2e/node_modules"
mkdir -p "$CTX/work/e2e/node_modules"
for store in "@playwright+test@${PLAYWRIGHT_VERSION}" "playwright@${PLAYWRIGHT_VERSION}" "playwright-core@${PLAYWRIGHT_VERSION}"; do
  cp -rL "$REPO/node_modules/.pnpm/$store/node_modules/." "$CTX/work/e2e/node_modules/"
done

# 3. BFF: built dist + seed + production-only dependencies (offline).
if [[ "${SKIP_DEPLOY:-0}" != "1" || ! -d "$CTX/work/services/bff" ]]; then
  rm -rf "$CTX/work/services"
  mkdir -p "$CTX/work/services"
  DEPLOY_TMP="$(mktemp -d)"
  pnpm --filter bff deploy --prod --offline "$DEPLOY_TMP/bff"
  mkdir -p "$CTX/work/services/bff"
  cp -r "$DEPLOY_TMP/bff/node_modules" "$CTX/work/services/bff/node_modules"
  cp -r "$DEPLOY_TMP/bff/dist" "$DEPLOY_TMP/bff/seed" "$DEPLOY_TMP/bff/package.json" "$CTX/work/services/bff/"
  rm -rf "$DEPLOY_TMP"
fi

# 4. Built web bundle + the locale catalogs the locale-smoke spec reads.
rm -rf "$CTX/work/apps"
mkdir -p "$CTX/work/apps/web/src/i18n"
cp -r apps/web/dist "$CTX/work/apps/web/dist"
cp -r apps/web/src/i18n/locales "$CTX/work/apps/web/src/i18n/locales"

# Ship the tree as ONE tar: Docker Desktop's context transfer from WSL rejects
# symlinks (pnpm's node_modules is a symlink farm), but ADD extracts a local
# tar archive in the image with its symlinks intact.
tar -C "$CTX/work" -cf "$CTX/work.tar" .

cat > "$CTX/Dockerfile" <<DOCKERFILE
FROM ${BASE_IMAGE}
ADD work.tar /work/
WORKDIR /work/e2e
DOCKERFILE

# Only Dockerfile + work.tar go in the context (the assembled tree stays out).
BUILD_CTX="$CTX/context"
rm -rf "$BUILD_CTX"
mkdir -p "$BUILD_CTX"
mv "$CTX/work.tar" "$CTX/Dockerfile" "$BUILD_CTX/"
"$DOCKER" build -t "$IMAGE" "$BUILD_CTX"

ARGS=("$@")
[[ ${#ARGS[@]} -gt 0 ]] || ARGS=(--project=chromium --reporter=list)

NAME="travelhub-e2e-run-$$"
status=0
"$DOCKER" run --name "$NAME" --ipc=host "$IMAGE" node node_modules/playwright/cli.js test "${ARGS[@]}" || status=$?
# Best effort: bring traces/screenshots back for debugging.
rm -rf "$REPO/e2e/test-results"
"$DOCKER" cp "$NAME:/work/e2e/test-results" "$REPO/e2e/test-results" >/dev/null 2>&1 || true
"$DOCKER" rm "$NAME" >/dev/null 2>&1 || true
exit "$status"
