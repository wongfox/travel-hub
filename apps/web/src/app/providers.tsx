import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { I18nextProvider } from "react-i18next";
import type { i18n as I18nInstance } from "i18next";
import type { AppRouter } from "./router.js";
import { createBrowserI18n } from "../i18n/index.js";

const defaultQueryClient = new QueryClient();

let cachedBrowserI18n: I18nInstance | undefined;
function getDefaultI18n(): I18nInstance {
  cachedBrowserI18n ??= createBrowserI18n();
  return cachedBrowserI18n;
}

/**
 * Composes the i18next provider (task 4.3), the TanStack Query client
 * provider, and the router provider (task 4.2). `router` is a required prop
 * (rather than an internal default) so tests can inject a router built with
 * a memory history; `i18n` is optional and defaults to a lazily-created
 * browser-backed instance so tests can inject a deterministic locale.
 */
export function AppProviders({
  router,
  queryClient = defaultQueryClient,
  i18n = getDefaultI18n(),
}: {
  router: AppRouter;
  queryClient?: QueryClient;
  i18n?: I18nInstance;
}) {
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </I18nextProvider>
  );
}
