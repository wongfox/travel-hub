import { defineConfig, devices } from "@playwright/test";

/**
 * Task 14.1 — Playwright E2E suite config.
 *
 * This suite targets the REAL `docker-compose` stack (root `docker-compose.yml`,
 * task 13.1): `web` on :8080 (nginx, proxies `/api/*`/`/webhooks/*` to
 * `bff-api`), `bff-api` on :3000, `bff-worker`, and `postgres`. It deliberately
 * does NOT declare a Playwright `webServer` block — this suite assumes the
 * stack is already running (`docker-compose up -d`), matching how a real
 * deployment's smoke suite works, not a local-dev convenience wrapper.
 *
 * Honesty note (see `sdd/travel-hub-mvp/apply-progress`, WU24): this config,
 * every fixture, and every spec file below were written and statically
 * verified (`npx playwright test --list`, `tsc --noEmit`, `eslint`) in a
 * sandbox with NO reachable Docker engine (`docker compose build`/`up` fail
 * with "failed to connect to the docker API"). None of these scenarios have
 * actually been RUN against a live stack. The next owner with a working
 * Docker engine must run `docker-compose up -d --build` then
 * `pnpm --filter e2e test:e2e` and record real pass/fail results before this
 * task can be considered verified end-to-end.
 */
const WEB_BASE_URL = process.env["E2E_WEB_BASE_URL"] ?? "http://localhost:8080";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    baseURL: WEB_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Scenario 7 (push opt-in) is Chromium-only by the design's own
      // scenario name — Firefox/WebKit's Push API/permission model differs
      // enough that the design never asked for cross-browser push coverage.
      // Every other spec also runs here for broad smoke coverage, since
      // nothing in this suite is Chromium-specific besides push.
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
      testIgnore: /(05-precheckin-capture|07-push-opt-in)\.spec\.ts/,
    },
  ],
});
