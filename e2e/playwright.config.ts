import { defineConfig, devices } from "@playwright/test";

/**
 * Task 14.1 — Playwright E2E suite config.
 *
 * The suite starts its OWN BFF in-process (`fixtures/stack.ts` ->
 * `harness/in-process-stack.ts`): api + worker in one Node process with stub
 * adapters injected, feature flags enabled through the composition root's
 * options, and a tiny static server that serves the BUILT web bundle
 * (`apps/web/dist`) and proxies `/api`, `/webhooks`, `/healthz` to that BFF
 * the way `apps/web/docker/nginx.conf` does. The `baseURL` fixture points at
 * that server, so no external stack, no `webServer` block and no exposed
 * link-token route is needed. Prerequisites: `pnpm -w exec turbo run build
 * --filter=bff --filter=contracts --filter=web`. Browsers cannot launch in
 * every dev environment; `scripts/run-in-docker.sh` packages and runs the
 * suite inside the Playwright image (see `README.md`).
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
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
