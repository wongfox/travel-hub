import { createRouter } from "@tanstack/react-router";
import type { RouterHistory } from "@tanstack/react-router";
import { routeTree } from "./route-tree.js";

/**
 * Factory (rather than a single module-level singleton) so tests can inject
 * a memory history without touching the browser's real URL.
 */
export function createAppRouter(options?: { history?: RouterHistory }) {
  return createRouter({
    routeTree,
    ...(options?.history ? { history: options.history } : {}),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
