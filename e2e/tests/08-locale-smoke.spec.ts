import { test, expect } from "@playwright/test";
import { issueLink, waitForApiHealthy } from "../fixtures/internal-api.js";
import { readLocaleCatalog, lookup, SUPPORTED_LOCALES, type SupportedLocale } from "../fixtures/locale-catalog.js";

/**
 * Design scenario 8/7 (the extra one): "ES/EN/PT smoke pass across the
 * shipped screens".
 *
 * Forces each locale via `localStorage["th-locale"]` (`apps/web/src/i18n/index.ts`'s
 * `LOCALE_STORAGE_KEY`/explicit-choice resolution — task 4.3 Decision 14)
 * BEFORE navigation, then asserts the REAL shipped catalog string
 * (`fixtures/locale-catalog.ts` reads the actual JSON files, not a
 * second hardcoded copy) renders on screen.
 *
 * Two routes need no session at all and are NOT blocked by any known gap —
 * these run for real today (see this WU's apply-progress for the actual
 * command/result against the standalone `apps/web` dev server, since no
 * live docker-compose stack is reachable in this sandbox either):
 * `/trip` with no prior session (not-found boundary at an undefined path),
 * and `/t` with no token in the fragment (the invalid-link error state).
 *
 * Every other shipped screen needs a session, which is blocked by Gap A
 * (`e2e/KNOWN-GAPS.md`); `/trip/menu` and `/trip/destination` are
 * ADDITIONALLY excluded from this sweep entirely (Gap B: `menu.enabled`/
 * `destination.enabled` default off with no override), per the Review
 * Workload note in `KNOWN-GAPS.md`'s summary table.
 */
async function setLocale(page: import("@playwright/test").Page, locale: SupportedLocale): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem("th-locale", value);
  }, locale);
}

for (const locale of SUPPORTED_LOCALES) {
  test.describe(`locale smoke — ${locale}`, () => {
    test(`not-found boundary renders fully in ${locale}`, async ({ page }) => {
      await setLocale(page, locale);
      const catalog = readLocaleCatalog(locale);

      await page.goto("/this-route-does-not-exist");

      await expect(page.getByRole("alert")).toContainText(lookup(catalog, "notFound.title"));
      await expect(page.getByRole("alert")).toContainText(lookup(catalog, "notFound.body"));
    });

    test(`invalid-link state renders fully in ${locale}`, async ({ page }) => {
      await setLocale(page, locale);
      const catalog = readLocaleCatalog(locale);

      // No fragment at all -> `readTokenFromHash` returns null -> the
      // landing page renders its error/re-request state immediately,
      // without ever calling the BFF.
      await page.goto("/t");

      await expect(page.getByRole("alert")).toContainText(lookup(catalog, "tripAccess.invalidLink"));
      await expect(page.getByRole("button", { name: lookup(catalog, "tripAccess.relinkForm.submit") })).toBeVisible();
    });

    test(`shipped trip screens render fully in ${locale}`, async ({ page, request }) => {
      test.fixme(true, "Gap A (e2e/KNOWN-GAPS.md): no token retrieval, so no authenticated screen is reachable");

      await setLocale(page, locale);
      const catalog = readLocaleCatalog(locale);
      await waitForApiHealthy(request);

      const { token } = await issueLink(request, {
        reservationRef: "RES-1001",
        contact: { kind: "email", address: "passenger@example.com" },
        locale,
      });

      await page.goto(`/t#${token}`);
      await expect(page).toHaveURL(/\/trip$/);
      await expect(page.getByText(lookup(catalog, "nav.itinerary"))).toBeVisible();
      await expect(page.getByText(lookup(catalog, "nav.documents"))).toBeVisible();

      await page.goto("/trip/itinerary");
      await expect(page.getByRole("heading")).toContainText(lookup(catalog, "itinerary.heading"));

      await page.goto("/trip/documents");
      await expect(page.getByRole("heading")).toContainText(lookup(catalog, "documents.heading"));

      await page.goto("/trip/help");
      await expect(page.getByRole("heading")).toBeVisible();
    });
  });
}
