# E2E suite (Playwright, in-process BFF)

The suite starts its own BFF **in the test process** — api + worker with stub
adapters injected, feature flags enabled through the composition root's
options, a non-production `nodeEnv` — and a small static server that serves the
built web bundle and proxies `/api`, `/webhooks` and `/healthz` to it (mirroring
`apps/web/docker/nginx.conf`; `/internal` is not proxied). Link tokens are read
straight from the stub `LinkDeliveryPort`'s in-memory deliveries
(`fixtures/internal-api.ts`); **no HTTP route exposes them** and no production
code path exists for that.

- `harness/in-process-stack.ts` — the stack (shared stores, job scan driver, web server)
- `fixtures/stack.ts` — worker-scoped Playwright fixture; also sets `baseURL`
- `fixtures/internal-api.ts` — `issueLink()`; `fixtures/passenger-api.ts` — in-page fetch helpers

## Run

```sh
pnpm -w exec turbo run build --filter=bff --filter=contracts --filter=web
pnpm --filter e2e test:e2e          # needs browsers that can launch locally
```

## Run inside the Playwright image (no local browser deps, no network at run time)

```sh
# WSL + Docker Desktop: DOCKER="/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe"
DOCKER=docker e2e/scripts/run-in-docker.sh [playwright test args]
```

The script builds `bff`/`contracts`/`web`, then assembles a build context under
`e2e/.docker-ctx/` (git-ignored): the e2e sources, Playwright's runtime packages,
`pnpm --filter bff deploy --prod --offline` output (built `dist`, `seed`,
production `node_modules`) and `apps/web/dist`. The tree is shipped as a single
tar (`ADD work.tar`) because Docker Desktop rejects the symlinks of pnpm's
`node_modules` when sent as a context from WSL. Nothing is installed inside the
container. Env: `DOCKER`, `E2E_IMAGE`, `E2E_DOCKER_CTX`, `SKIP_BUILD=1`,
`SKIP_DEPLOY=1`. Traces/screenshots of a run are copied back to `e2e/test-results/`.

Known gaps and their status: [`KNOWN-GAPS.md`](./KNOWN-GAPS.md).
