import { test as base, expect } from "@playwright/test";
import { startInProcessStack, type InProcessStack } from "../harness/in-process-stack.js";

/**
 * Worker-scoped fixture: ONE in-process BFF (api + worker, stub adapters,
 * flags on) plus the web bundle's static/proxy server per Playwright worker
 * process. Tests run in that same process, so they read stub adapters
 * (e.g. link deliveries) directly instead of over HTTP. `baseURL` is pointed
 * at the same-origin web server, so `page.goto("/trip")` just works.
 */
export const test = base.extend<object, { stack: InProcessStack }>({
  stack: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const stack = await startInProcessStack();
      try {
        await use(stack);
      } finally {
        await stack.close();
      }
    },
    { scope: "worker", auto: false },
  ],
  baseURL: async ({ stack }, use) => {
    await use(stack.webUrl);
  },
});

export { expect };
