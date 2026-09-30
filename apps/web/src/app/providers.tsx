import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import type { AppRouter } from "./router.js";

const defaultQueryClient = new QueryClient();

/**
 * Composes the TanStack Query client provider with the router provider
 * (task 4.2). `router` is a required prop (rather than an internal default)
 * so tests can inject a router built with a memory history.
 */
export function AppProviders({
  router,
  queryClient = defaultQueryClient,
}: {
  router: AppRouter;
  queryClient?: QueryClient;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
